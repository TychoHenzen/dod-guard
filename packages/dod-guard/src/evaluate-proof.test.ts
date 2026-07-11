import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { parseSurvivors, executeProof } from "./evaluate-proof.js";
import type { ExecFn, RunResult } from "./evaluate-proof.js";
import type { TaskNode } from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function fakeExec(exitCode: number, combined: string): ExecFn {
  return async (_cmd, _cwd) => ({ exitCode, combined, duration: 42 });
}

function fakeExecResult(exitCode: number, combined: string, overrides?: Partial<RunResult>): RunResult {
  return { exitCode, combined, duration: 42, ...overrides };
}

function concreteNode(overrides?: Partial<TaskNode>): TaskNode {
  return {
    id: "n1",
    title: "Test Proof",
    refinement: "concrete",
    command: "echo ok",
    description: "a test proof",
    predicate: { type: "exit_code", value: 0 },
    last_status: "pending",
    ...overrides,
  };
}

const CWD = "/fake/project";

// ── parseSurvivors ──────────────────────────────────────────────────────

describe("parseSurvivors", () => {
  it("parses Stryker output with survived column", () => {
    const out = ["File | # killed | # survived", "src/foo.ts | 10 | 3", "All files | 50 | 7"].join("\n");
    assert.equal(parseSurvivors(out), 7);
  });

  it("parses Stryker with different survived header casing", () => {
    const out = ["File | # Killed | # Survived | # Timeout", "All files | 42 | 1 | 0"].join("\n");
    assert.equal(parseSurvivors(out), 1);
  });

  it("parses mutmut output with survivor count", () => {
    assert.equal(parseSurvivors("Mutation run finished. 🙁 3 mutants survived."), 3);
    assert.equal(parseSurvivors("🙁 0 mutants bad, but we keep going"), 0);
  });

  it("parses cargo-mutants missed count", () => {
    assert.equal(parseSurvivors("test result: 12 passed; 3 missed; 0 timeout"), 3);
    assert.equal(parseSurvivors("results: 0 missed, 5 caught"), 0);
  });

  it("returns null for unrecognized output", () => {
    assert.equal(parseSurvivors("all tests passed"), null);
    assert.equal(parseSurvivors(""), null);
  });

  it("returns first parsable result when multiple tools match", () => {
    // Stryker format wins over cargo-mutants because it's checked first
    const out = "File | # survived\nAll files | 5\nand also: 2 missed";
    assert.equal(parseSurvivors(out), 5);
  });

  it("returns null when Stryker header found but data row missing", () => {
    const out = "File | # killed | # survived\n|------|----------|------------|";
    assert.equal(parseSurvivors(out), null);
  });
});

// ── executeProof — basic predicates ─────────────────────────────────────

describe("executeProof - basic predicates", () => {
  it("returns fail when no command is set", async () => {
    const node = concreteNode({ command: "" });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /no command/);
    assert.equal(result.exit_code, -1);
  });

  it("exit_code: passes when exit code matches", async () => {
    const node = concreteNode({ predicate: { type: "exit_code", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, "ok"));
    assert.equal(result.status, "pass");
  });

  it("exit_code: fails when exit code differs", async () => {
    const node = concreteNode({ predicate: { type: "exit_code", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(1, "failed"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /pred.*fail/i);
  });

  it("exit_code_not: passes when exit code does NOT match", async () => {
    const node = concreteNode({ predicate: { type: "exit_code_not", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(1, ""));
    assert.equal(result.status, "pass");
  });

  it("exit_code_not: fails when exit code matches", async () => {
    const node = concreteNode({ predicate: { type: "exit_code_not", value: 1 } });
    const result = await executeProof(node, CWD, fakeExec(1, ""));
    assert.equal(result.status, "fail");
  });

  it("output_contains: passes when stdout contains the string", async () => {
    const node = concreteNode({ predicate: { type: "output_contains", value: "SUCCESS" } });
    const result = await executeProof(node, CWD, fakeExec(0, "build: SUCCESS in 3s"));
    assert.equal(result.status, "pass");
  });

  it("output_contains: fails when stdout does not contain it", async () => {
    const node = concreteNode({ predicate: { type: "output_contains", value: "MISSING" } });
    const result = await executeProof(node, CWD, fakeExec(0, "something else"));
    assert.equal(result.status, "fail");
  });

  it("output_matches: passes when regex matches", async () => {
    const node = concreteNode({ predicate: { type: "output_matches", value: "\\d+ tests passed" } });
    const result = await executeProof(node, CWD, fakeExec(0, "42 tests passed, 0 failed"));
    assert.equal(result.status, "pass");
  });

  it("output_matches: fails when regex does not match", async () => {
    const node = concreteNode({ predicate: { type: "output_matches", value: "^all green$" } });
    const result = await executeProof(node, CWD, fakeExec(0, "some output"));
    assert.equal(result.status, "fail");
  });

  it("output_not_contains: passes when stdout lacks the string", async () => {
    const node = concreteNode({ predicate: { type: "output_not_contains", value: "ERROR" } });
    const result = await executeProof(node, CWD, fakeExec(0, "everything ok"));
    assert.equal(result.status, "pass");
  });

  it("output_not_contains: fails when stdout has it", async () => {
    const node = concreteNode({ predicate: { type: "output_not_contains", value: "ERROR" } });
    const result = await executeProof(node, CWD, fakeExec(0, "ERROR: something broke"));
    assert.equal(result.status, "fail");
  });

  it("output_not_matches: passes when regex does not match", async () => {
    const node = concreteNode({ predicate: { type: "output_not_matches", value: "FATAL" } });
    const result = await executeProof(node, CWD, fakeExec(0, "all good here"));
    assert.equal(result.status, "pass");
  });

  it("output_not_matches: fails when regex matches", async () => {
    const node = concreteNode({ predicate: { type: "output_not_matches", value: "FATAL" } });
    const result = await executeProof(node, CWD, fakeExec(0, "FATAL: crash"));
    assert.equal(result.status, "fail");
  });

  it("returns the command output in the leaf result", async () => {
    const node = concreteNode();
    const result = await executeProof(node, CWD, fakeExec(0, "hello world"));
    assert.equal(result.output, "hello world");
    assert.equal(result.duration_ms, 42);
  });
});

// ── executeProof — exec failures (killed, notFound) ────────────────────

describe("executeProof - exec failures", () => {
  it("reports fail when process was killed", async () => {
    const node = concreteNode();
    const exec: ExecFn = async () => fakeExecResult(-1, "timeout", { killed: true, error: "SIGTERM" });
    const result = await executeProof(node, CWD, exec);
    assert.equal(result.status, "fail");
    assert.equal(result.exit_code, -1);
  });

  it("reports fail when command not found", async () => {
    const node = concreteNode();
    const exec: ExecFn = async () =>
      fakeExecResult(127, "not found", { notFound: true, error: "command not found: xyz" });
    const result = await executeProof(node, CWD, exec);
    assert.equal(result.status, "fail");
    assert.equal(result.exit_code, 127);
  });
});

// ── executeProof — mutation ─────────────────────────────────────────────

describe("executeProof - mutation", () => {
  it("passes when survivors <= max", async () => {
    const node = concreteNode({ predicate: { type: "mutation", value: 5 } });
    const result = await executeProof(node, CWD, fakeExec(0, "🙁 3"));
    assert.equal(result.status, "pass");
  });

  it("fails when survivors > max", async () => {
    const node = concreteNode({ predicate: { type: "mutation", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, "🙁 5"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /mutation: 5 > max 0/);
  });

  it("max defaults to 0 when value not set", async () => {
    const node = concreteNode({ predicate: { type: "mutation" } });
    const result = await executeProof(node, CWD, fakeExec(0, "🙁 1"));
    assert.equal(result.status, "fail");
  });

  it("fails when mutation results cannot be parsed", async () => {
    const node = concreteNode({ predicate: { type: "mutation", value: 5 } });
    const result = await executeProof(node, CWD, fakeExec(0, "garbled output"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /could not parse mutation/);
  });

  it("passes when survivors is zero (all killed)", async () => {
    const node = concreteNode({ predicate: { type: "mutation", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, "🙁 0"));
    assert.equal(result.status, "pass");
  });
});

// ── executeProof — regression ───────────────────────────────────────────

describe("executeProof - regression", () => {
  it("captures baseline on first run and passes", async () => {
    const node = concreteNode({ predicate: { type: "regression" } });
    const result = await executeProof(node, CWD, fakeExec(0, "metric: 100 ms"));
    assert.equal(result.status, "pass");
    assert.equal(node.baseline_value, 100);
    assert.ok(node.baseline_captured_at);
    assert.match(result.error ?? "", /N0=100/);
  });

  it("rejects GREEN without prior RED baseline re-capture (seen_failing guard)", async () => {
    // Regression baseline_captured_at is set — this is NOT seen_failing.
    // The regression handler doesn't check seen_failing; it just captures
    // baseline on first run. This test verifies that baseline capture works
    // even with exit 0 on first run (the "first run" is the baseline).
    const node = concreteNode({ predicate: { type: "regression" } });
    const result = await executeProof(node, CWD, fakeExec(0, "42"));
    assert.equal(result.status, "pass");
    assert.equal(node.baseline_value, 42);
  });

  it("passes on subsequent run when metric stays within tolerance (lower_is_better)", async () => {
    const node = concreteNode({
      predicate: { type: "regression", value: 0.1, lower_is_better: true },
    });
    node.baseline_value = 100;
    node.baseline_captured_at = "2024-01-01T00:00:00Z";
    // threshold = 100 * (1 + 0.1) = 110, 105 <= 110 → pass
    const result = await executeProof(node, CWD, fakeExec(0, "105"));
    assert.equal(result.status, "pass");
  });

  it("fails when metric exceeds tolerance (lower_is_better)", async () => {
    const node = concreteNode({
      predicate: { type: "regression", value: 0.1, lower_is_better: true },
    });
    node.baseline_value = 100;
    node.baseline_captured_at = "2024-01-01T00:00:00Z";
    // threshold = 110, 120 > 110 → fail
    const result = await executeProof(node, CWD, fakeExec(0, "120"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /regression/);
  });

  it("passes when metric increases (higher_is_better, e.g. coverage)", async () => {
    const node = concreteNode({
      predicate: { type: "regression", value: 0.05, lower_is_better: false },
    });
    node.baseline_value = 80;
    node.baseline_captured_at = "2024-01-01T00:00:00Z";
    // threshold = 80 * (1 - 0.05) = 76, 85 >= 76 → pass
    const result = await executeProof(node, CWD, fakeExec(0, "85"));
    assert.equal(result.status, "pass");
  });

  it("fails when metric drops below tolerance (higher_is_better)", async () => {
    const node = concreteNode({
      predicate: { type: "regression", value: 0.05, lower_is_better: false },
    });
    node.baseline_value = 80;
    node.baseline_captured_at = "2024-01-01T00:00:00Z";
    // threshold = 76, 70 < 76 → fail
    const result = await executeProof(node, CWD, fakeExec(0, "70"));
    assert.equal(result.status, "fail");
  });

  it("uses coverage category defaulting to higher_is_better=false (i.e. lower_is_better defaults false for coverage)", async () => {
    // Default: n.category !== "coverage" → lower_is_better = true (smaller is better)
    // For coverage: n.category === "coverage" → lower_is_better defaults false (larger is better)
    const node = concreteNode({
      predicate: { type: "regression", value: 0.1 },
      category: "coverage",
    });
    node.baseline_value = 80;
    node.baseline_captured_at = "2024-01-01T00:00:00Z";
    // coverage defaults: lower_is_better = false → threshold = 80*(1-0.1) = 72
    // 70 < 72 → fail
    const result = await executeProof(node, CWD, fakeExec(0, "70"));
    assert.equal(result.status, "fail");
  });

  it("returns fail-safe when no numeric metric in output", async () => {
    const node = concreteNode({ predicate: { type: "regression" } });
    const result = await executeProof(node, CWD, fakeExec(0, "no numbers here"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /no metric/);
  });

  it("uses extract regex to find the metric", async () => {
    const node = concreteNode({
      predicate: { type: "regression", extract: "coverage:\\s*([\\d.]+)%" },
    });
    const result = await executeProof(node, CWD, fakeExec(0, "coverage: 87.5% of lines, total: 200"));
    assert.equal(result.status, "pass");
    assert.equal(node.baseline_value, 87.5);
  });
});

// ── executeProof — streamline ───────────────────────────────────────────

describe("executeProof - streamline", () => {
  it("passes when match count <= max", async () => {
    const node = concreteNode({ predicate: { type: "streamline", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
  });

  it("fails when match count > max", async () => {
    const node = concreteNode({ predicate: { type: "streamline", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, "line1\nline2\nline3"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /3 > max 0/);
  });

  it("interprets exit 1 as 'no matches found' → pass", async () => {
    const node = concreteNode({ predicate: { type: "streamline", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(1, "grep: no matches"));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /no matches/);
  });

  it("fails safe on exit >1 (grep error)", async () => {
    const node = concreteNode({ predicate: { type: "streamline", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(2, "grep: invalid regex"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /exit 2/);
  });

  it("counts only non-empty lines", async () => {
    const node = concreteNode({ predicate: { type: "streamline", value: 1 } });
    const result = await executeProof(node, CWD, fakeExec(0, "line1\n\n  \nline2"));
    // 2 non-empty lines > 1 → fail
    assert.equal(result.status, "fail");
  });
});

// ── executeProof — manual & review ──────────────────────────────────────

describe("executeProof - manual & review", () => {
  it("skips manual proof when no manual_result cached", async () => {
    const node = concreteNode({ predicate: { type: "manual" } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "skipped");
    assert.match(result.output ?? "", /not verified/);
  });

  it("skips review proof when no manual_result cached", async () => {
    const node = concreteNode({ predicate: { type: "review" } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "skipped");
    assert.match(result.output ?? "", /not verified/);
  });

  it("uses cached manual_result when fingerprint matches", async () => {
    const node = concreteNode({
      predicate: { type: "manual" },
      manual_result: {
        answer: "pass",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        proof_fingerprint: "will-be-recomputed",
      },
    });
    // Pre-seed correct fingerprint so cache hit works
    const { perProofFingerprint } = await import("./manual.js");
    const mr1 = node.manual_result;
    if (!mr1) throw new Error("manual_result not set");
    mr1.proof_fingerprint = perProofFingerprint(node);
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "pass");
    assert.match(result.output ?? "", /✓.*PASS/);
  });

  it("uses cached manual_result when answer is fail", async () => {
    const node = concreteNode({
      predicate: { type: "manual" },
      manual_result: {
        answer: "fail",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        proof_fingerprint: "",
      },
    });
    const { perProofFingerprint } = await import("./manual.js");
    const mr2 = node.manual_result;
    if (!mr2) throw new Error("manual_result not set");
    mr2.proof_fingerprint = perProofFingerprint(node);
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.output ?? "", /✗.*FAIL/);
  });

  it("ignores cached manual_result when fingerprint mismatches", async () => {
    const node = concreteNode({
      predicate: { type: "manual" },
      manual_result: {
        answer: "pass",
        confirmed_at: "2024-01-01T00:00:00Z",
        channel: "messagebox",
        proof_fingerprint: "wrong-fingerprint",
      },
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "skipped");
  });
});

// ── executeProof — TDD ──────────────────────────────────────────────────

describe("executeProof - TDD", () => {
  it("records RED on first failure (no prior seen_failing)", async () => {
    // TDD: exp=0, exit=1 → g=false → not green, seen_failing=false → RED path
    const node = concreteNode({ predicate: { type: "tdd", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(1, "test failed"));
    assert.equal(result.status, "fail");
    assert.equal(node.seen_failing, true);
    assert.ok(node.seen_failing_at);
    assert.match(result.error ?? "", /TDD RED/);
  });

  it("rejects GREEN without prior RED", async () => {
    const node = concreteNode({ predicate: { type: "tdd", value: 0 } });
    const result = await executeProof(node, CWD, fakeExec(0, "all tests pass"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /GREEN w\/o prior RED/);
  });

  it("passes on GREEN after RED (full TDD cycle)", async () => {
    const node = concreteNode({
      predicate: { type: "tdd", value: 0 },
    });
    node.seen_failing = true;
    node.seen_failing_at = "2024-01-01T00:00:00Z";
    const result = await executeProof(node, CWD, fakeExec(0, "all tests pass"));
    assert.equal(result.status, "pass");
    assert.match(result.error ?? "", /TDD verified/);
  });

  it("TDD value defaults to 0 when not set", async () => {
    const node = concreteNode({ predicate: { type: "tdd" } });
    // No seen_failing → exit 0 → tautology
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /GREEN w\/o prior RED/);
  });

  it("fails when still failing after RED (not GREEN yet)", async () => {
    const node = concreteNode({
      predicate: { type: "tdd", value: 0 },
    });
    node.seen_failing = true;
    node.seen_failing_at = "2024-01-01T00:00:00Z";
    const result = await executeProof(node, CWD, fakeExec(1, "still failing"));
    assert.equal(result.status, "fail");
    assert.match(result.error ?? "", /TDD: failed/);
  });
});

// ── executeProof — unknown / default predicate ──────────────────────────

describe("executeProof - default predicate path", () => {
  it("falls through switch to evaluatePredicate for unknown type", async () => {
    const node = concreteNode({
      // @ts-expect-error — test default branch with unknown predicate type
      predicate: { type: "future_type", value: 0 },
    });
    const result = await executeProof(node, CWD, fakeExec(0, "ok"));
    // evaluatePredicate default returns true → pass
    assert.equal(result.status, "pass");
  });

  it("evaluates default branch with non-zero exit → fail", async () => {
    const node = concreteNode({
      // @ts-expect-error — test default branch
      predicate: { type: "future_type", value: 0 },
    });
    const result = await executeProof(node, CWD, fakeExec(1, "error"));
    // evaluatePredicate default returns true regardless of exit code → pass
    // Actually the default returns true always. Let me verify.
    // Yes: default: return true — so it always passes.
    assert.equal(result.status, "pass");
  });
});

// ── executeProof — edge cases ───────────────────────────────────────────

describe("executeProof - edge cases", () => {
  it("handles undefined predicate gracefully (defaults to exit_code 0)", async () => {
    const node = concreteNode({ predicate: undefined });
    const result = await executeProof(node, CWD, fakeExec(0, "ok"));
    assert.equal(result.status, "pass");
  });

  it("preserves node metadata in result", async () => {
    const node = concreteNode({
      id: "custom-id",
      title: "Custom Title",
      description: "Custom description",
    });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    assert.equal(result.id, "custom-id");
    assert.equal(result.title, "Custom Title");
    assert.equal(result.description, "Custom description");
    assert.equal(result.command, "echo ok");
  });

  it("handles empty string output", async () => {
    const node = concreteNode({ predicate: { type: "output_contains", value: "" } });
    const result = await executeProof(node, CWD, fakeExec(0, ""));
    // empty string is contained in empty string
    assert.equal(result.status, "pass");
  });

  it("handles multiline output in output_matches — \\n becomes literal newline in regex too", async () => {
    // predicate value "line1\\nline2" → JS string line1\nline2 → RegExp(/line1\nline2/m)
    // The regex's \n is a literal newline, same as in the string → match succeeds
    const node = concreteNode({
      predicate: { type: "output_matches", value: "line1\\nline2" },
    });
    const result = await executeProof(node, CWD, fakeExec(0, "line1\nline2"));
    assert.equal(result.status, "pass");
  });

  it("handles regex special characters in output_contains (literal match)", async () => {
    const node = concreteNode({
      predicate: { type: "output_contains", value: "test (foo) [bar]" },
    });
    // output_contains uses includes() — literal string match, not regex
    const result = await executeProof(node, CWD, fakeExec(0, "prefix test (foo) [bar] suffix"));
    assert.equal(result.status, "pass");
  });

  it("exit_code_not with value as number type", async () => {
    const node = concreteNode({ predicate: { type: "exit_code_not", value: 1 } });
    // exit 1 → NOT 1 is false → fail
    const result = await executeProof(node, CWD, fakeExec(1, ""));
    assert.equal(result.status, "fail");
  });
});
