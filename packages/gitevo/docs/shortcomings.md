# GitEvo — 10 Biggest Shortcomings

Investigation of `packages/gitevo` (v0.1.11). Findings ranked by impact. Line
references are to `src/operations.ts`, `src/memory.ts`, and `src/index.ts` at the
time of writing.

Confidence tags: 🟢 verified in source · 🟡 inferred from code behavior.

---

## 1. Re-running `evo_init` destroys all existing lessons before migration can save them 🟢

`evo_init` clears the lessons file, *then* migrates it:

```
operations.ts:243   fs.writeFileSync(paths.lessonsFile, "", "utf-8");   // wipes content
operations.ts:267   migrateLessons(cwd);                               // reads empty file
```

`migrateLessons` reads `lessons.jsonl`, sees it is empty, renames it to
`.migrated`, and returns `0` (`memory.ts:248-253`). So any pre-existing lessons are
gone before migration runs. The migration path is effectively dead on re-init and
doubles as silent data loss. CLAUDE.md advertises re-init as "idempotent" — it is
destructive.

**Fix direction:** migrate *before* clearing, or never clear a file that holds the
only copy of accumulated lessons.

---

## 2. The SQLite memory bus ignores the working directory threaded through operations 🟢

`operations.ts` carefully passes `cwd` (from `getRepo()`) into every git and path
helper. But the memory-bus writers do not accept a cwd and fall back to
`process.cwd()`:

```
memory.ts:126   writeMessage      → getMemoryDb()        // no cwd
memory.ts:148   queryMessages     → getMemoryDb()        // no cwd
memory.ts:207   recordCheckpoint  → getMemoryDb()        // no cwd
memory.ts:221   recordBranch      → getMemoryDb()        // no cwd
```

`getMemoryDb` caches by cwd (`memory.ts:96-99`). If the process cwd differs from the
repo path used by git ops — or if evomcp reads a memory bus for a repo other than
the one it launched in — writes and reads target different databases. The bus that
is supposed to enable "cross-lineage communication between evomcp candidates" is
silently keyed off ambient `process.cwd()`.

**Fix direction:** thread `cwd` into `writeMessage`/`queryMessages`/`recordCheckpoint`/`recordBranch`.

---

## 3. `getRepo()` uses `process.cwd()` as the repo root, discarding the real toplevel 🟢

```
operations.ts:59-64
  const cwd = process.cwd();
  git(["rev-parse", "--show-toplevel"], cwd);   // result discarded
```

It runs `rev-parse --show-toplevel` only to validate, then throws the answer away
and uses raw `process.cwd()` for every `.evo/` path and stash operation. Invoke any
tool from a subdirectory and `.evo/` (plus `memory.db`, `lessons.jsonl`) is created
in that subdirectory, while the git tags it creates apply repo-wide. State ends up
scattered and orphaned.

**Fix direction:** use the toplevel returned by `rev-parse` as the canonical cwd.

---

## 4. Lesson storage is split across two stores that diverge; `evo_export_lessons` reads the wrong one 🟢

`evo_learn` dual-writes to both `lessons.jsonl` and the SQLite bus
(`operations.ts:334-338`). But:

- `evo_lessons` prefers SQLite and falls back to JSONL (`operations.ts:354-381`).
- `evo_export_lessons` reads **only** JSONL (`operations.ts:388-419`).
- `migrateLessons` renames JSONL to `.migrated` (`memory.ts:277`).

After a migration, `evo_export_lessons` — the whole bridge into obsidian-rag — sees
only lessons written since the rename, missing everything migrated into SQLite. The
two surfaces (`evo_lessons`, `evo_export_lessons`, `evo_summary` counts) can each
report a different subset. There is no single source of truth.

**Fix direction:** pick one store (SQLite) and have every reader/exporter go through it.

---

## 5. Checkpoints tag a commit but nothing is ever committed — work-in-progress is not captured 🟡

`evo_checkpoint` auto-stashes dirty changes, tags **HEAD** (the last commit), then
pops the stash back (`operations.ts:280-315`). It never commits. Since an LLM
agent's work-in-progress is uncommitted, a "checkpoint" captures none of it — it
just re-tags whatever commit already existed. `evo_spawn` from that checkpoint
therefore branches from the last real commit, not from the state the agent was in.
The core promise ("checkpoint → spawn → explore → revert") silently loses all
uncommitted work unless the agent commits by hand first.

**Fix direction:** auto-commit (or document loudly that checkpoints require a prior commit).

---

## 6. Merge conflicts are unhandled — `evo_adopt`/`evo_finish` leave the repo mid-merge 🟢

`evo_adopt` runs `git merge branch --no-edit` (`operations.ts:707`). On conflict,
`git` returns non-zero, `git()` throws `EvoError`, and the function aborts — leaving
the index in a conflicted `MERGING` state with no `--abort`, no recovery hint.
`evo_finish` calls `evo_adopt` internally (`operations.ts:738`), so it inherits the
same failure and additionally aborts partway through its cleanup, having merged
nothing but about to delete tags/branches on the next run. There is no conflict
strategy anywhere in the codebase.

**Fix direction:** detect conflict, `git merge --abort`, and return an actionable error.

---

## 7. `evo_abandon` defaults to `git reset --hard HEAD~1`, an arbitrary and fragile target 🟢

When no checkpoint is passed, abandon reverts to `HEAD~1` (`operations.ts:577,603`).
This assumes the branch is exactly one commit past its origin. If the exploration
made several commits, only the last is dropped; if it made zero commits (all work
uncommitted, per #5), the reset discards an unrelated parent commit. `HEAD~1` has no
relationship to the checkpoint the branch was spawned from.

**Fix direction:** default to the spawn-origin checkpoint (already recorded in the
`branches` table's `spawned_from`), not `HEAD~1`.

---

## 8. Platform/layout assumptions are hard-coded into a supposedly generic tool 🟢

The pre-flight safety checks bake in this monorepo's shape and language:

- `staleDistFiles` scans a hard-coded `packages/*/dist/` layout (`operations.ts:132-142`).
- `untrackedSourceFiles` only recognizes `.ts .js .mjs .json .md .yml .yaml`
  (`operations.ts:110`) — a Python, Go, or Rust repo gets no untracked-file protection.
- `.test.js` with no `.ts` is flagged "stale" even in projects that ship hand-written JS.

GitEvo is described as generic evolutionary branching for any repo, but its safety
net silently only works for TypeScript monorepos structured like this one.

**Fix direction:** make extensions/layout configurable, or derive them from the repo.

---

## 9. Windows: `evo_finish` `rmSync`s `.evo/` while the SQLite handle is still open 🟡

`getMemoryDb` caches the `better-sqlite3` handle for the process lifetime and never
closes it (`memory.ts:96-113`); WAL mode leaves `-wal`/`-shm` sidecar files.
`evo_finish` then does `fs.rmSync(paths.evoDir, { recursive: true, force: true })`
(`operations.ts:760-762`) with that handle still open. On Windows (the stated host
platform) an open file handle can block directory removal or strand the `.db-wal` /
`.db-shm` files, so cleanup partially fails and a stale `.evo/` reappears.

**Fix direction:** close and evict the cached DB before removing `.evo/`.

---

## 10. Non-idempotent exports + duplicate branch rows pollute downstream stores 🟢

Two accretion bugs:

- `evo_export_lessons` builds each memory id from `Date.now()` + `Math.random()`
  (`operations.ts:405`). Re-exporting the same lesson yields a new id every time, so
  obsidian-rag accumulates duplicate memories with no stable dedup key.
- `recordBranch` always `INSERT`s (`memory.ts:220-227`); `evo_spawn`, `evo_abandon`,
  and `evo_adopt` each add a fresh row for the same branch with different status, so
  the `branches` table grows a messy multi-row history with no upsert and no way to
  read "current status of branch X" cleanly.

**Fix direction:** derive export ids from a content hash; upsert branch status by name.

---

## Honorable mentions (not in the top 10)

- **Version drift:** `index.ts:34` hard-codes `version: "0.1.3"` while `package.json`
  is `0.1.11`; the file header says "13 tools" but 15 are registered. 🟢
- **Concurrency mismatch:** WAL is enabled for the DB, but git operates on a single
  working tree. Parallel evomcp candidates cannot actually check out different
  branches at once in one repo — they would stomp each other's checkout. 🟡
- **`evo_checkpoints` sorts tags lexicographically** and calls it "roughly newest
  first" (`operations.ts:514-515`), even though the `checkpoints` table stores real
  timestamps that go unused. 🟢
- **Swallowed stash-pop failures:** several error paths `catch {}` a failed
  `git stash pop` (`operations.ts:469-471, 585-587`), so a conflicted pop can strand
  changes in the stash with no surfaced warning. 🟢
