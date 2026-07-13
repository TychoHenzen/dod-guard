# Evaluation Prompt — gitevo

> Hand this whole file to a fresh evaluation agent. It is self-contained.
> Goal: prove `gitevo` works as intended **and cannot destroy real work**.

## Role & mission

You are a release-gate evaluator for `gitevo`, an MCP server that gives LLM agents
evolutionary git branching (checkpoint / spawn / learn / abandon / adopt). Your job is
to determine, with evidence, whether every tool behaves as documented and whether any
tool can cause **silent data loss**. You produce a verdict report. You do **not** commit,
push, publish, or "fix" anything unless a later instruction explicitly says so — findings
first, patches only on approval.

gitevo is the single most dangerous package in this monorepo: every mutating op runs
`git stash` / `git checkout` / `git reset` / `git tag -d` via `execSync` against the git
repo found at **`process.cwd()`**. Treat it accordingly.

## 🔴 Non-negotiable safety rails (read before touching anything)

1. **Never run any gitevo mutating op inside the real `dod-guard` repo, or any repo the
   user cares about.** All operations resolve their target via `process.cwd()` →
   `git rev-parse --show-toplevel`. If cwd is the real repo, a bad `evo_abandon`/`evo_spawn`
   can hard-reset or clobber it.
2. **Do all functional testing inside a throwaway sandbox repo** you create under the OS
   temp dir (e.g. `%TEMP%\gitevo-eval-<rand>`) — a fresh `git init`, **not a git worktree**
   (worktrees share the real repo's object store and have caused breakage; avoid them). `cd`
   into it, seed a few commits. Every tool call must run with that sandbox as cwd.
3. **Snapshot before destructive tests.** Before any test that could lose data, record
   `git rev-parse HEAD`, `git status --porcelain`, `git stash list`, `git tag`, and the
   set of untracked files. After the test, diff against the snapshot and assert only the
   intended change occurred.
4. **Kill switch.** If any op hangs, appears to operate on the wrong repo, or you see the
   real repo's path in output, STOP immediately and report — do not retry.
5. **No network, no auth, no cost.** gitevo is pure-local git; if any call tries to reach
   the network, that itself is a finding.
6. Leave the machine clean: delete the sandbox repo(s) and any `evo-*` tags/branches/stashes
   you created when done.

## Orientation (read these first)

- `packages/gitevo/CLAUDE.md` — architecture, tag naming, design decisions.
- `packages/gitevo/src/operations.ts` — all business logic (init, checkpoint, spawn,
  abandon, adopt, learn, finish, diff, summary, export). Read the git command each op runs.
- `packages/gitevo/src/index.ts` — the 13 MCP tool registrations + error wrapping.
- Tools to cover (all 13): `evo_init`, `evo_checkpoint`, `evo_checkpoints`, `evo_spawn`,
  `evo_branches`, `evo_learn`, `evo_lessons`, `evo_abandon`, `evo_adopt`, `evo_finish`,
  `evo_diff`, `evo_summary`, `evo_export_lessons`.

## How to drive the tools

Prefer importing the compiled operations directly (deterministic, no MCP round-trip):
`node --input-type=module -e "import('file:///.../packages/gitevo/dist/operations.js').then(...)"`,
after `process.chdir(sandbox)`. Build first: `npx tsc -p packages/gitevo`. Fall back to the
running MCP server (`node dist/bundle.js`) only if you need to test the tool-registration /
error-wrapping layer in `index.ts`.

## Phase 1 — Static & unit baseline

1. `npm test -w packages/gitevo` and `npm run test:integration -w packages/gitevo`. Record
   pass/fail counts. Any failure is a P0 finding.
2. `npm run coverage -w packages/gitevo`. Note which `operations.ts` branches — especially
   the stash-pop-failure and preflight-abort paths — are **uncovered**.
3. Read every `git([...])` call and classify it: read-only vs mutating. Build a table of
   which ops mutate the tree.

## Phase 2 — Functional matrix (happy path, in sandbox)

Run the documented workflow end to end and assert each result:
`evo_init` → `evo_checkpoint` → `evo_spawn` → (make a commit) → `evo_learn` →
`evo_checkpoint` → `evo_diff` → `evo_summary` → `evo_adopt` → `evo_finish`. Also exercise
`evo_branches`, `evo_checkpoints`, `evo_lessons`, `evo_export_lessons`, `evo_abandon`.

For each tool assert: (a) return string matches documented shape, (b) the git side effect
actually happened (tag created with right name `evo-{name}` / `evo-dead-{branch}` /
`evo-adopted`, branch switched, lessons.jsonl appended), (c) `.evo/` state is consistent,
(d) it is idempotent or errors cleanly on re-run where documented (e.g. `evo_init` re-run
clears lessons + re-tags root).

`evo_export_lessons` must emit obsidian-rag `memory_save`-compatible JSON — validate the shape.

## Phase 3 — Adversarial / failure injection (the real test)

These target the auto-stash + `preflightCheckoutSafety` logic (friction #28/#29/#34/G1/S8).
Each must **fail safe**: refuse with a diagnostic OR preserve all data, never silently lose it.

1. **Dirty tracked tree** → `evo_checkpoint` / `evo_spawn`: auto-stash, operate, pop. Assert
   working-tree changes survive after pop. Snapshot-diff to confirm.
2. **Untracked source files present** → `evo_spawn`: `git stash push` (no `-u`) does NOT save
   untracked files. Assert preflight **blocks** (untracked `.ts`/`.js` listed) unless
   `force=true`, and that no untracked file is lost.
3. **Stash-pop conflict**: create a change that conflicts with the target ref so `git stash pop`
   fails after checkout. Assert the tool reports "changes left in stash" and the stash still
   exists (no silent drop). Verify `git stash list`.
4. **Target ref deletes files in HEAD** → `evo_spawn`/`evo_abandon`: preflight must list
   "WILL BE DELETED" and abort unless forced.
5. **Stale dist/ with no matching src**: assert `staleDistFiles` flags it.
6. **`force=true` bypass**: confirm it actually bypasses — and that this is the *only* way to
   proceed through a blocked preflight (no accidental bypass path).
7. **Not initialized**: every op except `evo_init` must error cleanly ("run evo_init first"),
   not throw raw.
8. **Wrong state / missing tag**: `evo_adopt`/`evo_diff` against a non-existent checkpoint →
   clean error, no partial mutation.
9. **CRLF / autocrlf** (Windows): after checkout, confirm `.gitattributes eol=lf` prevents a
   false-dirty tree that would block the next op (friction #34).
10. **Concurrency**: two ops racing on the same sandbox (best-effort) — does a half-finished
    stash leave the repo wedged?

## Phase 4 — Safety audit (data-loss focus)

- Enumerate every code path that runs `git reset`, `git checkout <ref>`, `git checkout -- <file>`,
  `git clean`, or `git tag -d`. For each, answer: *what uncommitted or untracked state could this
  destroy, and what guards it?* Flag any mutating op reachable **without** a preflight or stash.
- Confirm `force=true` is required for every data-losing path and is never defaulted on.
- Check `execSync` calls for command-injection surface: can a branch/checkpoint/reason name
  containing shell metacharacters or a leading `-` (arg injection) reach the git CLI unsanitized?
  Test names like `"; rm -rf ."`, `--upload-pack=...`, `$(...)`, backticks.
- Resource leaks: orphaned stashes, dangling `evo-*` tags, branches never cleaned.

## Report format

Produce a single markdown report:

1. **Verdict**: `SHIP` / `SHIP-WITH-FIXES` / `DO-NOT-SHIP`, one line why.
2. **Tool matrix**: 13 rows — tool | verdict (PASS/WARN/FAIL) | evidence (command + observed).
3. **Findings**, severity-ranked (P0 data-loss / P1 correctness / P2 UX), each with: what,
   exact repro against the sandbox, observed vs expected, and a proposed minimal fix
   (described, not applied).
4. **Coverage gaps** worth a test.
5. **Cleanup confirmation**: sandbox + tags/branches/stashes removed.

Do not implement fixes in this pass. Report, then wait for go-ahead.
