# Evaluation Prompt — evomcp

> Hand this whole file to a fresh evaluation agent. It is self-contained.
> Goal: prove `evomcp` works as intended **and cannot burn money, spawn runaway
> processes, or execute attacker-controlled shell commands unsupervised.**

## Role & mission

You are a release-gate evaluator for `evomcp`, an MCP server that orchestrates a
cost-differentiated cascade solver: it spawns `claude -p` subprocesses pointed at a local
**deepclaude proxy (`http://127.0.0.1:3200`)** so DeepSeek does cheap best-of-N fanout +
repair chains, and evaluates candidates with a user-supplied **`verify_cmd`** (and optional
scalar **`fitness_cmd`**) which are **arbitrary shell commands**. Your job: verify correctness
of the orchestration and containment of its three hazards — **cost, process sprawl, and
arbitrary command execution**. Report findings; do not fix or publish unless later told to.

Tools to cover: `hello`, `status`, `solve`, `evolve`.

## 🔴 Non-negotiable safety rails

1. **Assume `solve`/`evolve` cost real money and spawn real subprocesses.** Do NOT run a live
   `solve`/`evolve` until Phase 3, and only then with: a tiny problem, `verify_cmd` that is a
   trivial safe check, the smallest fanout/iteration counts the API allows, and a short
   timeout. Confirm with the user before the first paid run.
2. **Sandbox the working directory.** Any live run must use a throwaway temp dir as its cwd,
   never the real repo — `verify_cmd`/`fitness_cmd` run shell there and candidate agents get
   file+shell tools.
3. **`verify_cmd` is code execution.** Treat it as the primary attack surface. In tests, only
   ever pass verify commands *you* wrote. Part of the audit is checking whether a malicious
   DoD/config could smuggle a command through it.
4. **Process hygiene.** Before/after each live run, enumerate `claude`/node child processes.
   Assert evomcp kills its children on timeout/completion — no orphans. If you see lingering
   `claude -p` processes, kill them and file a P0.
5. **Cost cap.** Track how many subprocess spawns each `solve` triggers (fanout × repair ×
   lineages). If a single call can fan out unboundedly, that is a finding regardless of the
   happy path working.
6. **Proxy dependency.** Live runs need the deepclaude proxy up on `127.0.0.1:3200` and a key
   in `~/.claude/backends.json`. If it is not running, `solve` should fail with **diagnostics**
   (the friction #36 `LineageDiagnostic`), not hang or crash. Test that offline path first.

## Orientation (read these first)

- `packages/evomcp/CLAUDE.md` — cascade strategy, proxy architecture.
- `packages/evomcp/src/agent.ts` — subprocess spawning, proxy config (`PROXY_URL`,
  `~/.claude/backends.json`), timeouts, output capture.
- `packages/evomcp/src/solve.ts` / `evolve.ts` — orchestration, lineages, repair loop,
  `LineageDiagnostic`.
- `packages/evomcp/src/dedup.ts` — candidate dedup.
- `packages/evomcp/src/index.ts` — 4 tool registrations + input schemas.

## Phase 1 — Static & unit baseline (no network, no cost)

1. `npm test -w packages/evomcp`. Record pass/fail. Any failure = P0.
2. `npm run coverage -w packages/evomcp`. Note uncovered branches, especially the
   no-output / timed-out / verify-failed lineage-diagnostic paths and dedup edge cases.
3. Read `agent.ts`: confirm every spawned subprocess has (a) a finite timeout, (b) a kill on
   timeout, (c) stdout/stderr captured (not inherited/leaked). Flag any spawn without a
   timeout or kill.
4. `hello` and `status`: drive them directly (cheap, no subprocess). Assert documented output.
   `status` should report solver/proxy state without spawning anything.

## Phase 2 — Orchestration logic with the agent layer MOCKED (no cost)

The valuable correctness tests don't need the real proxy. Mock the `claude -p` spawn
(`mock.module` on the agent module, or inject a fake exec) and drive `solve`/`evolve`:

1. **All lineages fail with no output** → assert the escalation report contains a
   `LineageDiagnostic` table distinguishing "claude produced NO output" vs "timed out" vs
   "verify failed" (friction #36). This is the headline fix — verify it actually works.
2. **One candidate passes `verify_cmd`** → assert `solve` returns it and stops (best-of-N
   short-circuits correctly).
3. **Repair chain**: candidate fails verify, repair feeds the error back, second attempt
   passes → assert repair iterations are bounded and the passing result is returned.
4. **Dedup**: identical candidates collapse; `dedup.ts` behaves on empty / whitespace / near-dup.
5. **`fitness_cmd` scalar**: evolve selects the higher-fitness candidate; malformed fitness
   output (non-numeric, empty) is handled, not crashed.
6. **Malformed inputs**: empty problem, absurd fanout counts, missing verify_cmd — clean error.

## Phase 3 — Live smoke (gated, minimal, supervised)

Only after Phase 1–2 pass and the user OKs a paid run:

1. **Offline-proxy path**: with the proxy **down**, run one tiny `solve`. Assert it returns a
   diagnostic report (not a hang, not a raw stack). Confirm no orphan processes.
2. **One tiny live solve** (proxy up): trivial problem, safe `verify_cmd` (e.g. a check that a
   file contains an expected string), smallest fanout, short timeout, sandbox cwd. Assert: a
   candidate is produced, verify runs, result returned, **all child processes exit**, spawn
   count matches the configured fanout (no runaway).
3. Measure wall-clock and spawn count. Record approximate cost.

## Phase 4 — Safety audit

- **Command-execution surface**: trace how `verify_cmd`/`fitness_cmd` reach the shell. Are they
  run via a shell (injection-prone) or arg-array? Can problem text, candidate output, or repair
  feedback influence the command that gets executed? Attempt a benign injection (e.g. verify_cmd
  output containing `$(...)` / backticks / `;`) and confirm it cannot escalate.
- **Untrusted subprocess output**: DeepSeek/candidate output is untrusted. Confirm evomcp never
  `eval`s it or interpolates it into a shell command.
- **Key handling**: confirm the DeepSeek key from `~/.claude/backends.json` is never logged,
  echoed into candidate prompts, or written to the sandbox.
- **Resource bounds**: max concurrent subprocesses, total spawn ceiling per call, timeout
  enforcement. A single `solve` must not be able to fork-bomb.
- **Failure isolation**: one crashed lineage must not abort the others or leave temp files.

## Report format

1. **Verdict**: `SHIP` / `SHIP-WITH-FIXES` / `DO-NOT-SHIP` + one-line why.
2. **Tool matrix**: `hello`, `status`, `solve`, `evolve` — verdict (PASS/WARN/FAIL) + evidence.
3. **Findings**, severity-ranked (P0 cost/RCE/runaway-process / P1 correctness / P2 UX): what,
   repro, observed vs expected, proposed minimal fix (described, not applied).
4. **Live-run ledger**: spawn counts, timeouts observed, approx cost, orphan-process check.
5. **Coverage gaps** worth a test.
6. **Cleanup**: sandbox removed, no lingering processes.

Report first. Implement nothing without go-ahead. Never launch a live run without explicit OK.
