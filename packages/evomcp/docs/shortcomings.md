# evomcp — Top 10 Shortcomings

Investigation date: 2026-07-20. Scope: `packages/evomcp/src/*`. Findings are ranked by
impact on correctness and on the package's advertised value proposition (cheap-model
fanout + verified selection + Goodhart-resistant anti-cheat).

Legend for evidence tags: 🟢 verified firsthand this session (with `file:line`).

---

## 1. Half the codebase is dead infrastructure

🟢 Only five modules are actually imported by the two MCP tools:
`agent.ts`, `gates.ts`, `judge.ts`, `gitevo-integration.ts`, and `convergence.ts`
(the last used by `evolve.ts` only).

The following modules are imported **only by their own `*.test.ts`** — never by
`index.ts`, `solve.ts`, or `evolve.ts`:

- `budget.ts` (per-stage token/time budgets, "cost per verified edge")
- `escalation.ts` (5-rung escalation ladder)
- `orchestrator.ts` (SPEC→TEST_AUTHOR→…→MERGE state machine; imports budget+escalation but nothing imports it)
- `context.ts` (7-layer context curator, SHA-256 cache)
- `degenerate.ts` (Goodhart-resistance detectors)
- `feedback.ts` (structured diagnostic compiler)
- `dedup.ts` (plan-diversity deduplication)

That is 7 of 16 source modules (~2,000 LOC + tests) that ship, compile, and are
documented in `CLAUDE.md` as if they were active subsystems, but do nothing at
runtime. `CLAUDE.md`'s "Files" table and "Solve/Evolve flow" descriptions describe a
system that largely does not exist in the executed path.

**Impact:** false documentation, dead maintenance burden, and every feature below
(budget enforcement, escalation ladder, degenerate detection, dedup) is silently absent.

---

## 2. "Parallel fanout" is actually sequential

🟢 `solve.ts:144` runs strategies in a plain `for` loop (`STRATEGY_LOOP`) that
`await`s each `spawnClaude` before starting the next. `evolve.ts:172` does the same and
even comments "NO Promise.all".

Yet the tool description and docs repeatedly promise parallelism:
- `index.ts:85` "Spawns N **parallel** 'claude -p' instances"
- `index.ts:90` "N **parallel** claude -p instances"
- `index.ts:39` schema: "Number of **parallel** claude -p instances (default 5, max 16)"
- `CLAUDE.md` Solve flow step 2: "Spawn N **parallel** `claude -p` instances"

With N=5 strategies × up to 3 repairs × a 5-min timeout, worst-case wall time is ~100
minutes fully serialized. The core latency benefit of best-of-N fanout is gone, and the
`max 16` fanout hint is actively misleading.

---

## 3. Goodhart-resistance never runs — the anti-cheat premise is unenforced

🟢 `degenerate.ts` (hardcoded test outputs, deleted assertions, broadened catches,
type-ignore density, disabled lint, empty tests, TODO bombs) is imported only by
`degenerate.test.ts`. Neither `solve.ts` nor `evolve.ts` calls `detectDegenerate`.

Verification is purely "does `verify_cmd` exit 0" (`solve.ts:229`, `evolve.ts` fitness
score). A DeepSeek worker can pass by hardcoding the expected value, deleting a failing
assertion, or broadening a `catch` — exactly the Goodharting this module was built to
catch — and evomcp will happily adopt it as the winner. In a monorepo whose entire theme
is anti-cheat DoD verification, the anti-cheat layer is disconnected.

---

## 4. gitevo operations run against the wrong directory (`spec.cwd` ignored)

🟢 Every raw git call in `solve.ts`/`evolve.ts` passes `{ cwd: spec.cwd }`
(e.g. `solve.ts:212`, `245`, `evolve.ts:143`). But the gitevo wrappers in
`gitevo-integration.ts` (`evo_checkpoint`, `evo_spawn`, `evo_adopt`, `evo_abandon`) take
**no cwd** — their `_cwd` parameter is explicitly ignored (see the comment at
`gitevo-integration.ts:86-88`), and gitevo resolves the repo from `process.cwd()`.

The MCP server's `process.cwd()` is fixed at launch (typically the plugin cache dir or
home), independent of `spec.cwd`. So checkpoint/spawn/adopt/abandon act on one repo while
the commits/checkouts/verify act on another. Unless the server happens to be launched
inside the target project, the evolutionary branching is a no-op or corrupts an unrelated
repo. This is a split-brain correctness bug, not a style nit.

---

## 5. `solve` crashes and strands the repo when a strategy makes no file changes

🟢 `solve.ts:212-213` runs `git add -A` then `git commit -m "..."` with **no
try/catch**. If a worker produced console output but no file edits, `git commit` fails
("nothing to commit") and `execSync` throws. Nothing catches it, so the whole `solve()`
promise rejects and the MCP tool errors out — leaving the working tree checked out on a
`solve-strategy-N` branch.

Notably `evolve.ts:207-216` wraps the identical commit in try/catch and treats failure as
"no changes produced." `solve` regressed relative to `evolve`; the two paths should share
one guarded helper.

---

## 6. Advertised parameters are silently ignored

🟢 These are declared in the Zod schemas / types but never read by any runtime logic
(`grep` over non-test sources finds no consumer):

| Param | Declared | Reality |
|-------|----------|---------|
| `budget_tokens` | `index.ts:38,68` | No budget is ever enforced (`budget.ts` unused). Runs to completion regardless. |
| `allowed_files` | `index.ts:40` | Nothing constrains what `claude -p` edits; the "files the solver is allowed to modify" claim is false. |
| `held_out_tests` | `index.ts:53` | Never run at a merge gate or anywhere. |
| `mutation_cmd` | `index.ts:76` | Mutation testing never invoked. |
| `strategy` enum | `index.ts:42` | No dispatch exists; `index.ts` always routes `solve`→best-of-n. The "'auto' inspects verify_cmd for scalar → evolve" behavior is not implemented. |

Relatedly, `solve.ts:102` hardcodes `stats.plans_deduped = numParallel` — the reported
"deduped" count is fabricated because `dedup.ts` never runs. Users configuring these
fields get a false sense of control.

---

## 7. No workspace isolation — mutates the user's live tree, and default-branch assumptions are brittle

🟢 `solve`/`evolve` commit, checkout, merge, and abandon directly on the caller's real
repo and `HEAD`. There is no git worktree or temp clone. Consequences:

- Two concurrent `solve`/`evolve` calls, or a user editing files mid-run, corrupt each
  other's state.
- On any failure between checkpoint and adopt, the repo is left on an arbitrary
  `solve-strategy-N` / `evolve-genX-candidateY` branch (see #5).
- `solve.ts:245,325,443` hardcode `git checkout master || git checkout main`. Any repo
  whose default branch is `trunk`/`develop`/etc. silently fails (`stdio: "ignore"`) and
  stays stranded on a strategy branch. `evolve.ts:143` does this correctly by capturing
  `rootBranch` dynamically — `solve` should too.

---

## 8. Failure-signature hashing is weak and stuck-detection is shallow

🟢 `hashFailure` (`agent.ts:416-432`) normalizes output then folds it into a **32-bit
non-cryptographic rolling hash** over only the first 500 chars. Despite SHA-256 being used
elsewhere in the monorepo, this is a collision-prone `(hash<<5)-hash` accumulator.

- Collisions → two genuinely different failures look identical → a lineage is killed as
  "stuck" (`solve.ts:332`) when it was actually progressing.
- The 500-char truncation means failures that differ only past char 500 hash identically.
- Stuck detection only compares each repair to the *immediately previous* signature, so
  an A→B→A oscillation is never detected as stuck.

---

## 9. The full prompt is passed as an argv, not stdin

🟢 `spawnClaude` (`agent.ts:266`) builds `args = ["-p", prompt]` and spawns `claude` with
that argument vector. Strategy/repair/mutation prompts embed `spec.context` plus entire
target-file contents (`evolve.ts:158-164` passes `targetFile.content`). On Windows the
command-line length limit is ~32k chars; large contexts will be truncated or the spawn
will fail outright. The robust approach is to pipe the prompt via stdin (or a temp file,
as already done for `--system-prompt-file`), not the argument list.

---

## 10. Cost accounting is global, fragile, and can't feed the "cost per verified edge" metric

🟢 `tokens_consumed` is computed as a delta of the proxy's **global** cumulative counter:
`getProxyCost()` before/after (`solve.ts:99,356`; `evolve.ts:109,377`).

- Any other process using the same proxy during the run pollutes the delta.
- In direct mode (proxy not ready) the value is left at `-1` → reported as "N/A".
- There is no per-lineage or per-stage attribution, so `budget.ts`'s headline metric
  ("primary metric: cost per verified graph edge") is uncomputable in practice — which is
  moot anyway since `budget.ts` is unwired (#1).

---

## Honorable mentions (smaller, still real)

- 🟢 **Returned `patch` is often wrong or empty.** `solve.ts:217,302` set
  `candidate.patch` to a 500-char slice of `claude -p` *stdout*, not a diff. The real diff
  paths use `git diff evo-solve HEAD` (`solve.ts:233,313`) against a hardcoded `evo-solve`
  branch that `solve` never creates (branches are `solve-strategy-N`), so that `execSync`
  throws and the IIFE returns `""`. The final `captureDiff` runs after checkout-to-master,
  where committed changes no longer show in `git diff HEAD`.
- 🟢 **Leftover scaffolding in production.** A `hello` world tool is still registered
  (`index.ts:186-202`) in the shipped MCP server.
- 🟢 **Two competing diagnostic parsers.** `gates.ts:parseDiagnostics` and the entire
  `feedback.ts` compiler both parse TS/ESLint/Biome output; only the former runs.
- 🟢 **API-key cache poisons on first miss.** `getBackendApiKey` (`agent.ts:38`) caches
  `null` permanently; a `backends.json` created after the first probe is never picked up
  for the life of the process.
- 🟢 **`claude -p` spawned with an empty auth token** when no key resolves
  (`agent.ts:248,262`) instead of failing fast, producing opaque "no output" lineages.

---

## Suggested remediation order

1. **Decide the fate of the dead modules (#1).** Either wire `degenerate`, `budget`,
   `escalation`, `dedup` into `solve`/`evolve`, or delete them and correct `CLAUDE.md`.
   Per project policy (no backwards-compat shims), pick one and cut cleanly.
2. **Fix the `spec.cwd` split-brain (#4)** — thread cwd into gitevo or run gitevo with the
   right working directory; without this, evolutionary branching is unreliable.
3. **Guard the `solve` commit + branch handling (#5, #7)** — share `evolve`'s guarded
   helper and dynamic root-branch capture; consider a worktree/temp-clone for isolation.
4. **Make fanout actually parallel or stop advertising it (#2).**
5. **Wire degenerate detection into winner selection (#3)** to restore the anti-cheat
   guarantee the monorepo is built around.
6. Remove or honor the dead parameters (#6); pipe prompts via stdin (#9); strengthen
   `hashFailure` (#8); scope cost tracking (#10); delete `hello` and the duplicate parser.
