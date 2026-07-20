# gitevo — Fix Plan

Derived from `shortcomings.md` (investigation of v0.1.11). Each step is atomic enough for a single `/step-by-step` subagent. Steps ordered so the cwd/root-derivation fixes (which everything else depends on) come first.

Root themes: (a) `process.cwd()` is used as the repo root instead of the git toplevel, poisoning every path and the memory bus; (b) lesson storage is split across two diverging stores; (c) checkpoints don't actually capture uncommitted work; (d) merge/abandon have no conflict handling.

---

## Step 1 — Use the git toplevel as the canonical cwd (#3) — FOUNDATION

**Problem:** `getRepo()` (operations.ts:59-64) runs `rev-parse --show-toplevel` only to validate, then discards it and uses raw `process.cwd()` for every `.evo/` path and stash op. Invoke from a subdirectory and `.evo/` (with `memory.db`, `lessons.jsonl`) is created in that subdir while git tags apply repo-wide — state scatters and orphans.

**Change:**
- Capture the toplevel from `rev-parse --show-toplevel` and use it as the canonical `cwd`/root for all `.evo/` paths, stash ops, and git calls.
- Everything downstream (paths, memory db, tags) resolves from this single root.

**Verify:** invoking any tool from `<repo>/packages/foo/` creates `.evo/` at `<repo>/.evo/`, not in the subdir. Add a test that runs an op from a nested cwd and asserts the `.evo` location.

**Files:** `operations.ts`.

---

## Step 2 — Thread `cwd` into the SQLite memory bus (#2)

**Problem:** memory-bus writers ignore the threaded cwd and fall back to `process.cwd()`: `writeMessage` (memory.ts:126), `queryMessages` (memory.ts:148), `recordCheckpoint` (memory.ts:207), `recordBranch` (memory.ts:221). `getMemoryDb` caches by cwd (memory.ts:96-99), so a differing process cwd targets a different database — the cross-lineage bus is silently keyed off ambient cwd.

**Change:**
- Add a `cwd` parameter to `writeMessage`, `queryMessages`, `recordCheckpoint`, `recordBranch` (and any other bus entry points), passing the canonical root from Step 1.
- All callers in `operations.ts` pass the repo root, not ambient cwd.

**Verify:** ops run from a nested cwd read/write the same `<root>/.evo/memory.db`. Test.

**Files:** `memory.ts`, `operations.ts`.

**Depends on Step 1.**

---

## Step 3 — Migrate lessons before clearing on re-init (#1) — DATA LOSS

**Problem:** `evo_init` clears the lessons file (operations.ts:243) *then* migrates it (operations.ts:267). `migrateLessons` reads the now-empty file, renames it `.migrated`, returns 0 (memory.ts:248-253). Pre-existing lessons are destroyed; CLAUDE.md calls re-init "idempotent" but it's destructive.

**Change:**
- Reorder: run `migrateLessons` (or otherwise preserve existing lessons into the canonical store) **before** any clear/truncate of `lessons.jsonl`.
- Better: don't clear the only copy at all — after migration into SQLite (Step 4), the JSONL clear is safe; before that, never truncate a populated lessons file on re-init.

**Verify:** create lessons, re-run `evo_init`, assert lessons still queryable via `evo_lessons`. Test.

**Files:** `operations.ts`, `memory.ts`.

---

## Step 4 — One lesson store (SQLite), all readers/exporters go through it (#4)

**Problem:** `evo_learn` dual-writes JSONL + SQLite (operations.ts:334-338); `evo_lessons` prefers SQLite (operations.ts:354-381); `evo_export_lessons` reads only JSONL (operations.ts:388-419); `migrateLessons` renames JSONL to `.migrated` (memory.ts:277). After migration, `evo_export_lessons` — the bridge into obsidian-rag — misses everything in SQLite. No single source of truth.

**Change:**
- Make SQLite the single source of truth. `evo_learn` writes only SQLite (drop the JSONL write, per no-backwards-compat policy — migrate any legacy JSONL on first access).
- `evo_lessons`, `evo_export_lessons`, and `evo_summary` counts all read from SQLite.
- Remove the JSONL fallback read paths.

**Verify:** learn → export → obsidian-rag JSON includes the lesson even after a migration cycle; all three surfaces report the same count. Tests.

**Files:** `operations.ts`, `memory.ts`.

**Depends on Steps 1–3.**

---

## Step 5 — Checkpoints must capture work-in-progress (#5)

**Problem:** `evo_checkpoint` auto-stashes dirty changes, tags **HEAD**, pops the stash back (operations.ts:280-315). It never commits, so an agent's uncommitted WIP is not captured — `evo_spawn` branches from the last real commit, not the agent's state. The core "checkpoint → spawn → explore → revert" promise silently loses WIP.

**Change:**
- On `evo_checkpoint`, if the tree is dirty, create a real commit (e.g. a WIP commit) and tag that, so the checkpoint captures the working state. Alternatively tag a commit made from the stash tree.
- Ensure `evo_spawn` then branches from the captured state.
- Update `evo_abandon` semantics (Step 6) to revert to this checkpoint commit.

**Verify:** make uncommitted edits, `evo_checkpoint`, `evo_spawn`, confirm the spawned branch contains the edits. Test.

**Files:** `operations.ts`.

---

## Step 6 — `evo_abandon` reverts to the spawn-origin checkpoint, not `HEAD~1` (#7)

**Problem:** with no checkpoint passed, abandon does `git reset --hard HEAD~1` (operations.ts:577,603), assuming exactly one commit past origin. Multiple commits → only last dropped; zero commits → discards an unrelated parent. `HEAD~1` has no relationship to the spawn checkpoint.

**Change:**
- Default the abandon target to the branch's recorded `spawned_from` checkpoint (from the `branches` table), not `HEAD~1`.
- Reset hard to that checkpoint commit/tag.

**Verify:** spawn from checkpoint C, make 3 commits, `evo_abandon` → tree at C, not at commit 2. Test.

**Files:** `operations.ts`, `memory.ts` (read `spawned_from`).

**Depends on Step 5 (checkpoint now points at real captured state).**

---

## Step 7 — Handle merge conflicts in `evo_adopt` / `evo_finish` (#6)

**Problem:** `evo_adopt` runs `git merge branch --no-edit` (operations.ts:707). On conflict, git returns non-zero, `git()` throws `EvoError`, function aborts — leaving the index in conflicted `MERGING` state with no `--abort` and no hint. `evo_finish` calls `evo_adopt` internally (operations.ts:738), inheriting the failure mid-cleanup.

**Change:**
- Detect merge conflict (non-zero merge exit), run `git merge --abort`, and return an actionable `EvoError` ("adopt failed: conflicts in <files>; resolve manually or abandon").
- `evo_finish` must not proceed with tag/branch deletion if the internal adopt failed — surface the error and leave state recoverable.

**Verify:** create a conflicting branch, `evo_adopt` → repo returns to a clean non-merging state with a clear error, not stuck in MERGING. Test.

**Files:** `operations.ts`.

---

## Step 8 — Close the SQLite handle before `rmSync` of `.evo/` on Windows (#9)

**Problem:** `getMemoryDb` caches the `better-sqlite3` handle for the process lifetime, never closes it (memory.ts:96-113); WAL leaves `-wal`/`-shm` sidecars. `evo_finish` does `fs.rmSync(paths.evoDir, {recursive, force})` (operations.ts:760-762) with the handle open — on Windows an open handle can block removal or strand `.db-wal`/`.db-shm`.

**Change:**
- Add a `closeMemoryDb(cwd)` that closes the handle and evicts it from the cache.
- `evo_finish` calls it before `rmSync`.

**Verify:** `evo_finish` on Windows removes `.evo/` completely with no stranded sidecars; a subsequent op re-opens a fresh DB. Test (or documented manual check on win32).

**Files:** `memory.ts`, `operations.ts`.

---

## Step 9 — Idempotent exports + upserted branch status (#10)

**Problem:** (a) `evo_export_lessons` builds memory ids from `Date.now()`+`Math.random()` (operations.ts:405) → re-export duplicates in obsidian-rag with no stable dedup key. (b) `recordBranch` always `INSERT`s (memory.ts:220-227); `evo_spawn`/`evo_abandon`/`evo_adopt` each add a fresh row per branch → messy multi-row history, no clean "current status of branch X."

**Change:**
- Derive export memory ids from a content hash (SHA-256 of the lesson's stable fields) so re-export is idempotent.
- Make `recordBranch` an upsert keyed by branch name (update status in place); provide a clean "current status" read.

**Verify:** export the same lessons twice → obsidian-rag sees no duplicates; spawn→abandon→adopt a branch → one row with final status. Tests.

**Files:** `operations.ts`, `memory.ts`.

---

## Step 10 — Generic-tool assumptions: configurable extensions/layout (#8)

**Problem:** pre-flight checks bake in this monorepo's shape: `staleDistFiles` scans hardcoded `packages/*/dist/` (operations.ts:132-142); `untrackedSourceFiles` only recognizes `.ts .js .mjs .json .md .yml .yaml` (operations.ts:110); `.test.js` with no `.ts` is flagged stale even in hand-written-JS projects. A Python/Go/Rust repo gets no protection.

**Change:**
- Make the source-file extension set and the dist/build layout configurable (via `.evo/config.json` or derived from the repo), defaulting to the current TS behavior.
- Skip the `.test.js`-stale heuristic unless a paired `.ts` build layout is detected.

**Verify:** a Rust repo's `.rs` files are seen by untracked-file protection; a hand-written-JS repo doesn't get false "stale" flags. Tests.

**Files:** `operations.ts`, new config loader.

---

## Step 11 — Version drift + minor cleanups (honorable mentions)

**Change:**
- Fix `index.ts:34` hardcoded `version: "0.1.3"` → read from `package.json` (currently 0.1.11); correct the "13 tools" header (15 registered).
- `evo_checkpoints`: sort by the real `checkpoints` table timestamps, not lexicographic tag order (operations.ts:514-515).
- Surface (don't swallow) failed `git stash pop` (operations.ts:469-471, 585-587) — warn that changes remain stashed.

**Verify:** version matches package.json; checkpoints list is truly newest-first; a conflicted stash pop emits a warning. Tests.

**Files:** `index.ts`, `operations.ts`.

---

## Suggested step grouping for `/step-by-step`

Steps 1→2 (cwd/toplevel + memory bus cwd) are the foundation — everything path-related depends on them, and evomcp's `spec.cwd` fix (evomcp fix-plan Step 1) couples to Step 1 here. Steps 3→4 (lesson store consolidation) chain. Steps 5→6 (checkpoint/abandon) chain. Steps 7, 8, 9, 10, 11 are largely independent.
