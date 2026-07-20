# evomcp — Fix Plan

Derived from `shortcomings.md` (investigation 2026-07-20). Each step is atomic enough for a single `/step-by-step` subagent. Steps ordered so foundational work unblocks later work.

**Correction to the original shortcomings framing:** the seven "dead" modules (`budget.ts`, `escalation.ts`, `orchestrator.ts`, `context.ts`, `degenerate.ts`, `feedback.ts`, `dedup.ts`) are **not cruft to delete** — they are half-built functionality that was never integrated into the executed path. They form a coherent, well-designed architecture (from `Evo_target.md`/`Evo-goals.md`): `orchestrator` is the deterministic spine (`SPEC→TEST_AUTHOR→IMPLEMENT→HARDEN→REVIEW→MERGE`), with `budget` + `escalation` hanging off it, and `context`/`feedback`/`dedup`/`degenerate` feeding the stages. The fix is to **wire them in**, not remove them. `CLAUDE.md` already documents them as active — that documentation becomes true once wired.

The plan has two tracks:
- **Track A — correctness bugs** in the currently-executed path (cwd split-brain, commit guard, parallelism, stdin, cost, patch, scaffolding). Do these first; they're independent and unblock safe integration.
- **Track B — integrate the half-built modules** into `solve.ts`/`evolve.ts`, culminating in the orchestrator spine.

Per project policy (no backwards-compat shims): when a module supersedes an ad-hoc inline behavior (e.g. `context.ts` replaces raw context stuffing in `strategyPrompts`, `feedback.ts` replaces the raw `verdict.output.slice()` in repair prompts), **replace the old path outright** — don't keep both.

---

# Track A — correctness bugs (executed path)

## A1 — Fix the `spec.cwd` split-brain in gitevo integration (#4) — HIGHEST PRIORITY

**Problem:** raw git calls in `solve.ts`/`evolve.ts` pass `{ cwd: spec.cwd }`, but the gitevo wrappers in `gitevo-integration.ts` (`evo_checkpoint`, `evo_spawn`, `evo_adopt`, `evo_abandon`) ignore their `_cwd` param (comment at gitevo-integration.ts:86-88) and resolve the repo from `process.cwd()`. Also `solve.ts:108` calls `evo_checkpoint("solve", ...)` with no cwd at all. Checkpoint/spawn act on one repo while commits/verify act on another → split-brain.

**Change:**
- Thread `cwd` through every gitevo wrapper and into the raw `evo_checkpoint` call at solve.ts:108. Pass it into the underlying gitevo op.
- This couples to gitevo's own `getRepo()` fix (see `packages/gitevo/docs/fix-plan.md` Step 1) — do that gitevo step first so the toplevel is derived correctly.
- Remove the "cwd ignored" comment once fixed.

**Verify:** launch the MCP server from directory A, run `solve` with `spec.cwd = B` → all tags/commits/checkouts land in B. Test asserting the wrapper forwards cwd.

**Files:** `gitevo-integration.ts`, `solve.ts`, `evolve.ts`.

---

## A2 — Guard the `solve` commit + dynamic root branch (#5, #7)

**Problem:** `solve.ts:212-213` runs `git add -A` + `git commit` with no try/catch — a strategy producing no file changes throws "nothing to commit," rejecting the whole `solve()` and stranding the repo on `solve-strategy-N`. `evolve.ts:207-216` already guards this. Also `solve.ts:245,325,443` hardcode `git checkout master || git checkout main`, stranding repos on `trunk`/`develop`.

**Change:**
- Extract a shared guarded helper `commitOrNoop(cwd, message): { committed: boolean }` used by both `solve` and `evolve`; treat commit failure as "no changes produced," not a throw.
- Extract a shared `rootBranch` capture (as `evolve.ts:143` already does dynamically) and replace all hardcoded `master||main` checkouts with it.

**Verify:** an edit-nothing strategy no longer rejects `solve`; a repo on `trunk` is restored to `trunk`. Tests for both.

**Files:** new `git-helpers.ts`, `solve.ts`, `evolve.ts`.

---

## A3 — Make fanout actually parallel (#2)

**Problem:** `solve.ts:144` (`STRATEGY_LOOP`) and `evolve.ts:172` run strategies serially (`await` each before the next), yet index.ts and CLAUDE.md promise "N parallel claude -p instances." Worst-case ~100 min fully serialized.

**Change:**
- Replace the serial loop with bounded-concurrency parallelism: spawn N `claude -p` via `Promise.allSettled` with a concurrency cap (e.g. `min(N, 4)`). **Note:** each strategy currently runs on its own git branch (`spawnCandidate` → checkout) in one working tree — true parallel checkouts collide. Either (a) give each lineage its own git worktree (preferred, coordinate with gitevo worktree support), or (b) parallelize only the `claude -p` generation while serializing the git commit/verify/checkout critical section.
- Repair chains stay per-lineage.

**Verify:** N=5 trivial strategies complete in ~1× a single run, not ~5×; no branch-checkout collision. Timing/spawn-count test.

**Files:** `solve.ts`, `evolve.ts`, `index.ts`, `CLAUDE.md`. (Depends on A2 for shared branch/commit helpers; may depend on gitevo worktree support.)

---

## A4 — Pipe the prompt via stdin, not argv (#9)

**Problem:** `spawnClaude` (agent.ts:266) builds `args = ["-p", prompt]`; prompts embed full target-file contents. Windows ~32k argv limit truncates/fails the spawn.

**Change:** spawn `claude -p` reading the prompt from stdin (or a temp file, mirroring existing `--system-prompt-file` handling). Remove `prompt` from argv. Confirm the correct `claude` CLI stdin invocation.

**Verify:** a >40k-char prompt spawns and the worker receives full text. Test with an oversized prompt.

**Files:** `agent.ts`.

---

## A5 — Fix the returned `patch` (honorable mention)

**Problem:** `solve.ts:217,302` set `candidate.patch` to a 500-char stdout slice, not a diff. Diff paths use `git diff evo-solve HEAD` against a hardcoded `evo-solve` branch that `solve` never creates (branches are `solve-strategy-N`) → throws, returns `""`. Final `captureDiff` runs after checkout-to-master where committed changes no longer diff against HEAD.

**Change:** capture the real diff of each candidate's commit against the root branch (`git diff <rootBranch>...<strategyBranch>`) using the dynamic names from A2, before checkout. Remove the stdout-slice fallback and the `evo-solve` reference.

**Verify:** returned `patch` is a valid unified diff of the actual change. Test.

**Files:** `solve.ts`.

---

## A6 — Delete leftover scaffolding + fix key-resolution bugs (honorable mentions)

**Change:**
- Remove the `hello` world tool registration (index.ts:186-202).
- Fix `getBackendApiKey` (agent.ts:38) so a `null` probe isn't cached permanently — cache only successes, so a later `backends.json` is picked up.
- Fail fast when no auth key resolves instead of spawning `claude -p` with an empty token (agent.ts:248,262) — replace opaque "no output" lineages with a clear error.

**Verify:** `hello` gone; a missing key errors clearly; a late-created `backends.json` is honored. Tests.

**Files:** `index.ts`, `agent.ts`.

---

## A7 — Scope cost tracking off the global proxy counter (#10)

**Problem:** `tokens_consumed` is a delta of the proxy's global cumulative counter (solve.ts:99,355; evolve.ts:109,377) — other processes pollute it; direct mode reports `-1`/"N/A"; no per-lineage attribution. This blocks `budget.ts`'s "cost per verified edge" metric (Track B).

**Change:** if the proxy exposes per-request/per-session cost, attribute per lineage instead of a global before/after delta; otherwise document the caveat and label direct-mode cost "unavailable" explicitly rather than `-1`. Feed per-lineage token counts into `budget.recordAttempt` once Track B wires budget.

**Verify:** a concurrent second proxy consumer doesn't inflate reported tokens (or caveat documented); direct-mode "unavailable" path tested.

**Files:** `agent.ts` (`getProxyCost`), `solve.ts`, `evolve.ts`.

---

# Track B — integrate the half-built modules

Order matters: standalone feeders first (context, dedup, feedback, degenerate), then the escalation/budget state that the orchestrator consumes, then the orchestrator spine last. Each `*.test.ts` already exists — integration steps add the wiring + an integration test proving the module runs in the executed path.

## B1 — Wire `context.ts` (7-layer context curator) into prompt assembly (#1, #6-`context`)

**Current:** `solve.ts:125` builds prompts via `strategyPrompts(spec.goal, numParallel, spec.context)` — raw context stuffing. `context.ts`'s `curateContext`/`ContextLayers` (GOAL→STRATEGY→TARGETS→DEPS→CONSTRAINTS→ATTEMPTS→FAILURES, SHA-256 cache) is unused.

**Change:**
- Assemble a `CuratedContext` per strategy via `context.ts` (goal, strategy label, target-file contents, constraints from lint/type config, prior attempts, failure signatures from the memory bus) and feed the assembled prompt into `spawnClaude`.
- Replace the raw context-stuffing path in `strategyPrompts`/`prompts.ts` — don't keep both (no shims).
- Use the SHA-256 cache to avoid re-assembling identical context across repairs.

**Verify:** a solve run assembles curated context (assert `curateContext` is invoked and its output reaches `spawnClaude`); the cache returns the same hash for identical inputs. Integration test.

**Files:** `context.ts`, `solve.ts`, `evolve.ts`, `prompts.ts`, `agent.ts`.

---

## B2 — Wire `dedup.ts` into pre-fanout plan diversity (#1, #6-`dedup`)

**Current:** `solve.ts:102` hardcodes `stats.plans_deduped = numParallel` — fabricated, because `dedup.ts` (`deduplicatePlans`, token-overlap heuristic) never runs.

**Change:**
- Before fanout, generate strategy plans and run `deduplicatePlans` to drop near-duplicates; re-sample to refill up to N distinct plans (or proceed with fewer and report honestly).
- Set `stats.plans_sampled` and `stats.plans_deduped` from the real dedup result.

**Verify:** two near-identical generated plans collapse to one; `plans_deduped` reflects the actual count. Integration test with synthetic duplicate plans.

**Files:** `dedup.ts`, `solve.ts`, `evolve.ts` (if evolve samples plans).

---

## B3 — Wire `feedback.ts` (structured diagnostic compiler) into the repair loop (#1, honorable-mention duplicate parser)

**Current:** repair prompts use `repairPrompt(spec.goal, candidate.verdict?.output ?? "", ...)` (solve.ts:276) — the raw verify output, truncated. `feedback.ts`'s `compileFeedback` (parse → 20-line context windows → dedup → severity sort → ~300-token cap, built on `gates.ts:parseDiagnostics`) is unused.

**Change:**
- In the repair loop, run `compileFeedback(verdict.output, cwd, gateType)` and feed the structured, token-budgeted diagnostics into `repairPrompt` instead of the raw slice.
- This resolves the "two competing diagnostic parsers" honorable mention by making `feedback.ts` the single compiler wrapping `gates.ts:parseDiagnostics` — keep both (feedback builds on gates), remove only the raw-slice path.

**Verify:** a failing candidate's repair prompt contains structured diagnostics with context windows, capped to budget, not raw dumped output. Integration test.

**Files:** `feedback.ts`, `solve.ts`, `prompts.ts`.

---

## B4 — Wire `degenerate.ts` (Goodhart detection) into winner selection (#3)

**Current:** verification is purely "does `verify_cmd` exit 0" (solve.ts:229). `degenerate.ts` (hardcoded outputs, deleted assertions, broadened catches, type-ignore density, disabled lint, empty tests, TODO bombs) never runs — a worker can Goodhart to "winner."

**Change:**
- After a candidate passes `verify_cmd` (and at the fitness/merge gate in `evolve.ts`), run `detectDegenerate` on the candidate's diff (available from A5).
- If degenerate signals fire above threshold, reject the candidate (don't add to `passingBranches`), record the signal in diagnostics, and continue to the next candidate / repair.
- Surface degenerate findings in the returned report.

**Verify:** a candidate that passes `verify_cmd` by deleting a failing assertion is rejected, not adopted. Integration test with a synthetic degenerate diff.

**Files:** `degenerate.ts`, `solve.ts`, `evolve.ts`. (Depends on A5 for a real diff.)

---

## B5 — Strengthen failure hashing to feed escalation signals (#8)

**Current:** `hashFailure` (agent.ts:416-432) is a 32-bit non-crypto rolling hash over the first 500 chars → collisions; stuck detection (solve.ts:332) only compares to the immediately previous signature, missing A→B→A oscillation. `escalation.ts`'s `TriggerSignals` need `stuck`, `oscillating`, `noProgress`.

**Change:**
- Replace the rolling hash with SHA-256 over the full normalized output.
- Track a per-lineage signature history; compute `stuck` (repeat in last K, default 3) and `oscillating` (A→B→A) signals from it. These become the `TriggerSignals` inputs for B6.

**Verify:** two distinct long failures don't collide; an A→B→A sequence is flagged oscillating. Tests.

**Files:** `agent.ts`, `solve.ts`.

---

## B6 — Wire `escalation.ts` + `budget.ts` into the solve/evolve loop (#1, #6-`budget`)

**Current:** the repair loop kills a lineage after 3 fixed repairs with no graduated response; `budget_tokens` (index.ts:38,68) is declared but never enforced. `escalation.ts` (retry→resample→re-decompose→stronger-model→human) and `budget.ts` (per-stage token/time caps, 50/80/95/100% warnings, cost-per-verified-edge) are unused.

**Change:**
- Create a `BudgetState` (seeded from `budget_tokens` / defaults) and an `EscalationState` at the start of solve/evolve.
- Per attempt: `recordAttempt(budget, stage, tokens, ms)` using per-lineage tokens from A7; on failure, build `TriggerSignals` (from B5 + budget exhaustion) and call `evaluateEscalation`. Act on the decision: `continue` (repair), `escalate` (resample = new strategy, re-decompose = split, stronger-model = switch model, human = escalation report), or `abort`.
- Replace the hardcoded `MAX_REPAIRS = 3` fixed loop with the escalation rung's `maxAttempts`.
- Honor `budget_tokens`: stop fanout/repairs when `budget.exhausted`, escalating to the human rung.
- Emit `budgetSummary`/warnings in progress output.

**Verify:** a lineage that stays stuck escalates retry→resample→…→human rather than silently dying at repair 3; exceeding `budget_tokens` halts and produces an escalation report. Integration tests for a stuck lineage and a budget-exhaustion path.

**Files:** `escalation.ts`, `budget.ts`, `solve.ts`, `evolve.ts`, `index.ts` (honor `budget_tokens`), `agent.ts` (model-switch for stronger-model rung).

---

## B7 — Wire the `orchestrator.ts` stage spine as the top-level solve driver (#1) — CAPSTONE

**Current:** `orchestrator.ts` (`createOrchestrator`, `advanceStage`, `checkStageGate`, `completeStage`/`failStage`, consuming budget+escalation) implements the deterministic `SPEC→TEST_AUTHOR→IMPLEMENT→HARDEN→REVIEW→MERGE` lifecycle but nothing constructs it. `solve.ts` is effectively only the IMPLEMENT stage.

**Change:**
- Introduce an orchestrated entry path where `solve`/`evolve` run as the **IMPLEMENT** stage inside the orchestrator, with the orchestrator enforcing stage gates, budget, and escalation across the full lifecycle.
- Implement (or bind to existing agents) the other stages:
  - **SPEC** and **REVIEW** map to the cascade skill's `spec-writer` / `patch-reviewer` agents (see `skills/cascade/agents/`); **HARDEN** maps to mutation testing via `mutation_cmd` (B8); **TEST_AUTHOR** authors + confirms RED tests; **MERGE** adopts the winner.
  - Where a stage has no automated implementation yet, gate it as a **human** rung (AskUserQuestion) rather than skipping — the orchestrator already blocks entry without the prior stage's flag.
- Honor the `strategy` enum dispatch and `held_out_tests` merge gate here (B8) so the orchestrator is where those advertised params take effect.

**Verify:** a full orchestrated run walks the stages in order, refuses to enter a stage whose gate isn't satisfied (e.g. IMPLEMENT before tests are RED), and records budget/escalation per stage. Integration test driving the state machine end-to-end with stubbed stage bodies.

**Files:** `orchestrator.ts`, `solve.ts`, `evolve.ts`, `index.ts` (new orchestrated tool/entry), cascade agents wiring.

**Scope note:** this is the largest step and may itself warrant a nested `/step-by-step` plan (one substep per stage). If so, do IMPLEMENT-as-stage + gate enforcement first (proves the spine), then add SPEC/TEST_AUTHOR/HARDEN/REVIEW/MERGE stage bodies incrementally.

---

## B8 — Honor the remaining advertised params via the orchestrator (#6)

**Current:** `held_out_tests` (index.ts:53), `mutation_cmd` (index.ts:76), `allowed_files` (index.ts:40), and the `strategy` enum (index.ts:42) are declared but never read.

**Change (each now has a home in the wired architecture):**
- `strategy` enum: implement `auto` dispatch (inspect `verify_cmd` for scalar → route to `evolve`) at the orchestrator/index entry.
- `held_out_tests`: run at the MERGE-stage gate (via `gates.ts` held-out support already present in `runAll`).
- `mutation_cmd`: invoke at the HARDEN stage.
- `allowed_files`: enforce by constraining worker prompts (via `context.ts` TARGETS layer) **and** post-hoc rejecting diffs that touch other files.

**Verify:** each param has a runtime consumer (grep proves it) and a behavioral test (e.g. a diff touching a non-allowed file is rejected; a scalar `verify_cmd` routes to evolve). Tests.

**Files:** `index.ts`, `orchestrator.ts`, `gates.ts`, `solve.ts`, `evolve.ts`, `context.ts`.

---

## Suggested step grouping for `/step-by-step`

**Do Track A first** (A1 is the top correctness bug; A1 depends on the gitevo `getRepo()` fix landing first). A1→A2→A3 chain (branch/commit helpers, then parallelism); A4, A5, A6, A7 independent.

**Then Track B**, in order: B1 (context) → B2 (dedup) → B3 (feedback) → B4 (degenerate, needs A5) → B5 (hashing) → B6 (escalation+budget, needs A7+B5) → **B7 (orchestrator capstone, needs B1–B6; consider a nested plan)** → B8 (params, needs B7). Each Track-B step turns a documented-but-dead subsystem into a live one; after B7, `CLAUDE.md`'s architecture description is finally accurate.
