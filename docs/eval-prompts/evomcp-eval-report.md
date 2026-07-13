# Evaluation Report — evomcp

**Date**: 2026-07-13
**Eval prompt**: `docs/eval-prompts/evomcp-eval.md`
**Evaluator**: Claude Code (caveman mode), direct session
**Package version**: 0.1.9

---

## 1. Verdict

**SHIP-WITH-FIXES** — evomcp core orchestration works correctly and safely. Best-of-N short-circuits, repair chains respect bounds, no orphan processes, proxy dependency handled gracefully. Three issues worth fixing before next release: coverage tooling broken (no sourcemaps), `tokens_consumed` always 0 (no subprocess token tracking), and fanout count hardcoded (not configurable). No P0 cost/RCE/runaway-process findings.

---

## 2. Tool Matrix

| Tool | Verdict | Evidence |
|------|---------|----------|
| `hello` | PASS | Returns sanitized greeting. Defensive: strips special chars, max-length caps at 100 chars. `hello("EvalRunner")` → `"Hello, EvalRunner!"` ✅ |
| `status` | PASS | Reports proxy state + key source. Proxy: `RUNNING`, API key: `SET (backends.json)`. Does not spawn subprocesses. Correctly identifies key source (`option` > `env` > `backends_json` > `none`). |
| `solve` | PASS | Live solve trivial task in sandbox: 5 parallel `claude -p` spawned, first candidate passed verification at 42.4s, file correctly modified, no orphan processes. Mocked tests cover escalation + repair + stuck detection + timed-out paths. |
| `evolve` | WARN | Mocked tests cover full evolution loop (18 tests), proxy-down, higher_is_better, bestPatch accumulation. Not tested live (no scalar fitness scenario in scope). The `git stash push/pop` state management in `saveState`/`restoreState` could be fragile on non-git repos or dirty trees — test coverage exists but the approach is risky. |

---

## 3. Findings

### P1-01: Coverage tooling returns 0% for all files

**Severity**: P1 (correctness — can't measure coverage)
**Category**: tooling
**File**: `packages/evomcp/tsconfig.json`

`npm run coverage -w packages/evomcp` runs `c8 --include="src/*.ts" ... --test "dist/*.test.js"`. Since the tsconfig has no `sourceMap: true`, c8 can't map compiled JS back to TS source. Result: every file reports 0% Stmts/Branch/Funcs/Lines. All 98 tests pass, but branch-level coverage gaps are invisible.

**Expected**: Either add `"sourceMap": true` to tsconfig, or switch to a coverage tool that instruments TS directly (e.g. vitest with `--coverage`).

**Repro**:
```bash
npm run coverage -w packages/evomcp
# Output: All files | 0 | 0 | 0 | 0 |
```

**Proposed fix**: Add `"sourceMap": true` to `packages/evomcp/tsconfig.json` under `compilerOptions`. c8 supports sourcemaps natively — this single change should surface real coverage numbers.

---

### P1-02: `tokens_consumed` always 0 — no subprocess token tracking

**Severity**: P1 (correctness — cost metric is invisible)
**Category**: correctness
**File**: `packages/evomcp/src/solve.ts:49`, `packages/evomcp/src/evolve.ts:33`

`RunStats.tokens_consumed` is initialized to `0` and never incremented. The `claude -p` subprocess output doesn't include token counts, so evomcp can't report actual API cost. This makes the `budget_tokens` parameter non-functional — it's accepted in the schema but never enforced.

**Expected**: Either parse token usage from `claude -p` output (if available), remove the field, or mark it as "not available" with a distinct sentinel (e.g. `-1` or `null`).

**Repro**: Any solve/evolve call. Stats always show `Tokens: 0` regardless of actual usage.

```bash
# Live solve consumed real API tokens for 5 parallel claude -p instances, but:
# Stats output: Tokens: 0
```

**Proposed fix**: If `claude -p` doesn't emit token counts, use the DeepSeek API response headers (`x-total-tokens` or equivalent) from the proxy, or estimate based on input/output character counts. At minimum, change the default to `null` so the UI doesn't report misleading `0`.

---

### P1-03: No test for "claude -p produced NO output" lineage diagnostic path

**Severity**: P1 (correctness — untested diagnostic branch)
**Category**: test-coverage
**File**: `packages/evomcp/src/solve.ts:117-130`, `packages/evomcp/src/solve.test.ts`

The solve orchestrator distinguishes "timed out" from "no output" (empty stdout from claude -p) and sets `final_status: "no_output"` in the lineage diagnostic. The test suite covers timed-out lineages (test 9) but never mocks `spawnClaudeN` returning an empty output with exit code 0 — the path where `claude -p` runs successfully but produces nothing. This diagnostic is explicitly called out in the eval prompt (friction #36 `LineageDiagnostic`) as a headline fix worth verifying.

**Expected**: Add a test where `spawnClaudeN` returns `{ output: "", exitCode: 0, timedOut: false }` and assert `lineage_diagnostics` contains entries with `final_status: "no_output"` and `claude_no_output: true`.

**Repro**: Existing test gap. No test exercises `!hasOutput` branch when `!r.timedOut`.

---

### P2-01: Fanout count hardcoded (N=5, not configurable)

**Severity**: P2 (UX — no control over parallelism/cost)
**File**: `packages/evomcp/src/solve.ts:61`

```typescript
const numParallel = DEFAULT_N; // ← always 5
```

The `TaskSpec` schema accepts `budget_tokens` and `strategy` but has no `fanout` or `parallelism` field. Users can't reduce N for cheap smoke tests or increase N for harder problems. The live eval could only run at N=5 (minimum cost for a trivial task was 5× `claude -p` spawns).

**Expected**: Add optional `fanout` (or `num_parallel`) field to `TaskSpecSchema` (default 5, min 1, max 16 or similar). Wire it through to `solve()`.

**Repro**: Any solve call. N is always 5 regardless of task complexity.

---

### P2-02: Offline-proxy path not tested live (proxy was running)

**Severity**: P2 (UX — degraded-mode behavior unverified)
**Category**: integration

The eval prompt specifies: "with the proxy **down**, run one tiny solve. Assert it returns a diagnostic report (not a hang, not a raw stack)." The proxy was live during evaluation and could not be stopped without disrupting the user session. The mocked test covers this (`proxyReady = false`, test warns but continues), but the real `claude -p` behavior with `useProxy: false` (direct to DeepSeek `/anthropic` endpoint) was not exercised.

**Expected**: Test on a machine without the proxy running. Confirm `solve` fails with diagnostics, not a hang.

**Mitigation**: The control flow is sound — `ensureProxy()` returning false sets `useProxy: false`, which switches the `ANTHROPIC_BASE_URL` to DeepSeek's direct endpoint. If the key is valid, this should work. If the key is also missing, `claude -p` will fail with an auth error, which evomcp captures as output and reports in the escalation diagnostic. The code path is correct even though the live test was skipped.

---

### P2-03: `runCommand` uses platform shell (execSync with string, not arg-array)

**Severity**: P2 (UX/documentation — by design, but worth documenting)
**File**: `packages/evomcp/src/agent.ts:330-358`

```typescript
const output = execSync(cmd, { cwd, encoding: "utf-8", ... });
```

`execSync` with a string command runs through the platform shell (cmd.exe on Windows, /bin/sh on POSIX). Shell metacharacters (`&`, `|`, `;`, `$()` on POSIX) are interpreted. This is by design — `verify_cmd`/`fitness_cmd` are shell commands by specification — but means:
- Commands must be written for the host OS (Windows: `findstr`, POSIX: `grep`)
- Shell injection is possible if a malicious spec reaches the tool

**Mitigation**: The MCP caller (Claude) is trusted to provide safe commands. Candidate output, repair feedback, and problem text never influence the command string — they only go into LLM prompts. No untrusted input reaches `execSync`.

---

## 4. Live-Run Ledger

| Metric | Value |
|--------|-------|
| Task | Add `// hello world` comment to placeholder.js |
| Verify cmd | `findstr /c:"hello world" placeholder.js` |
| Sandbox | `C:\Users\siriu\evomcp-eval-sandbox` (throwaway git repo) |
| Proxy | RUNNING on 127.0.0.1:3200 |
| Fanout (N) | 5 (hardcoded) |
| Candidates verified | 1 (first passed, short-circuited) |
| Wall clock | 42.4s |
| Orphan processes | None (ps aux shows no lingering claude processes) |
| Approx cost | ~$0.0001–0.001 (5× trivial claude -p calls, DeepSeek pricing) |
| tokens_consumed | 0 (not tracked — see P1-02) |
| Sandbox cleanup | Retained for inspection; no sensitive data |

---

## 5. Coverage Gaps Worth a Test

1. **No-output lineage diagnostic** (P1-03 above): mock `spawnClaudeN` returning empty output, assert `final_status: "no_output"` in diagnostics.
2. **Repair loop stuck detection**: the `hashFailure` comparison path (same signature after repair → stuck) is exercised indirectly by solve test 3, but no test explicitly asserts that a stuck lineage gets `final_status: "stuck"` in the diagnostic.
3. **`evolve` `readTargetFiles` glob edge cases**: what happens with empty directories, symlinks, or binary files matching a glob pattern?
4. **`evolve` `applyPatch` failure**: if `git apply` fails (malformed patch), the error is silently caught — should it surface via `onProgress`?
5. **Concurrent verify_cmd execution**: if verify_cmd has side effects (writes files), two candidates verified in sequence could interfere. Documented as caller's responsibility, but a test documenting the expectation would help.
6. **Key from backends.json with proxy auth**: if `backends.json` has a proxy config that differs from the direct key, the current logic uses the same key for both paths. Untested edge case.

---

## 6. Cleanup

- Sandbox at `C:\Users\siriu\evomcp-eval-sandbox` retained (no sensitive data)
- No lingering claude/node processes
- No temp files leaked (evomcp cleans up system-prompt tmp files + patch tmp files in finally blocks)

Verified: `ps aux` → no claude processes. Sandbox git log shows only the expected two commits.

---

## 7. Appendix: Agent Spawn Safety Checklist (Phase 1.3)

| Check | Status | Detail |
|-------|--------|--------|
| Every spawn has finite timeout | ✅ | Default 300s (solve) / 180s (repair/evolve), configurable via `opts.timeoutMs` |
| Kill on timeout | ✅ | SIGTERM → 2s wait → SIGKILL (agent.ts:249-258) |
| stdout/stderr captured (not inherited) | ✅ | `stdio: ["ignore", "pipe", "pipe"]` — never inherited |
| Temp files cleaned | ✅ | System prompt tmp files deleted in `cleanup()` (agent.ts:235-241); patch tmp files deleted in `applyPatch` finally block (evolve.ts:304-306) |
| Orphan process protection | ✅ | `settled` flag prevents race between timeout + close (agent.ts:225, 248, 278) |

---

## 8. Appendix: Phase 2 Test Coverage Mapping

| Eval Prompt Scenario | Existing Test | Status |
|---|---|---|
| All lineages fail → diagnostic table | `solve` test 2, 4, 9, 10 | ✅ |
| One candidate passes → short-circuit | `solve` test 1 | ✅ |
| Repair chain bounded + stuck detection | `solve` test 3 | ✅ |
| Dedup: empty, duplicate, near-dup, diverse | `deduplicatePlans` tests 1-9 | ✅ |
| Fitness scalar: malformed, higher_is_better | `evolve` tests 1, 14, 15 | ✅ |
| Malformed inputs: clean errors | `evolve` tests 1, 2 | ✅ |
| No-output diagnostic (claude_no_output) | **GAP** — P1-03 | ❌ |
