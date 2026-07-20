import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

// ── Mock state ────────────────────────────────────────────────────────────

let verifyExitCode = 0;
let verifyOutput = "verification passed";
let proxyReady = true;
let hashCounter = 0;
let spawnClaudeExit = 0;
let spawnClaudeTimedOut = false;
let spawnClaudeEmptyOutput = false;
let costSnapshotCalls = 0;
const repairPromptCalls: any[][] = [];
let mockDiffOutput: string | null = null;

mock.module("./agent.js", {
  namedExports: {
    ensureProxy: mock.fn(async () => proxyReady),
    hashFailure: mock.fn((_output: string, _cwd?: string) => `hash-${hashCounter++}`),
    computeFailureSignals: mock.fn((history: string[]) => {
      const k = 3;
      if (history.length < 2) return { stuck: false, oscillating: false, noProgress: false };
      const recent = history.slice(-k);
      const stuck = recent.length >= k && recent.every((h) => h === recent[0]);
      let oscillating = false;
      if (history.length >= 3) {
        oscillating = history[history.length - 1] === history[history.length - 3]
          && history[history.length - 1] !== history[history.length - 2];
      }
      const recentUnique = new Set(recent);
      const noProgress = recent.length >= k && recentUnique.size === recent.length;
      return { stuck, oscillating, noProgress };
    }),
    repairPrompt: mock.fn(
      (task: string, diagnostics: any[], attempt: number) => {
        repairPromptCalls.push([task, diagnostics, attempt]);
        return `repair|${task}|${attempt}|diags=${diagnostics.length}`;
      },
    ),
    runCommand: mock.fn((_cmd: string, _cwd: string) => ({
      output: verifyOutput,
      exitCode: verifyExitCode,
      durationMs: 10,
    })),
    spawnClaude: mock.fn(async (_p: string, _o: any) => {
      if (spawnClaudeEmptyOutput) return { output: "", exitCode: 0, durationMs: 100, timedOut: false };
      return {
        output: "spawn output",
        exitCode: spawnClaudeExit,
        durationMs: 100,
        timedOut: spawnClaudeTimedOut,
      };
    }),
    strategyPrompts: mock.fn((_task: string, n: number) => Array.from({ length: n }, (_, i) => `strategy-${i}`)),
    toVerdict: mock.fn((r: any) => ({
      passed: r.exitCode === 0,
      exit_code: r.exitCode,
      output: r.output,
      duration_ms: r.durationMs,
    })),
    getProxyCost: mock.fn(async () => {
      costSnapshotCalls++;
      // Return increasing totals to simulate real proxy accumulating tokens
      return {
        backends: {
          deepseek: {
            input_tokens: 1000 * costSnapshotCalls,
            output_tokens: 500 * costSnapshotCalls,
            requests: costSnapshotCalls,
          },
        },
        total_tokens: 1500 * costSnapshotCalls,
        total_cost: 0.002 * costSnapshotCalls,
      };
    }),
    proxyTokenDelta: mock.fn(async (costBefore: any) => {
      if (!costBefore) return -1;
      // Each call to getProxyCost increments costSnapshotCalls by 1
      // costBefore had a total_tokens of 1500 * (costSnapshotCalls) when it was taken
      // Now the counter has advanced, so delta = 1500
      return 1500;
    }),
    extractScore: mock.fn((output: string) => {
      const numbers = output.match(/-?\d+\.?\d*/g);
      if (!numbers || numbers.length === 0) return null;
      return Number.parseFloat(numbers[numbers.length - 1]);
    }),
  },
});

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((cmd: string, _opts?: any) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes("git diff")) {
        if (mockDiffOutput !== null) return mockDiffOutput;
        return "mock git diff output";
      }
      return Buffer.from("");
    }),
  },
});

// ── Mock cross-package imports ──────────────────────────────────────────

mock.module("../../gitevo/dist/operations.js", {
  namedExports: {
    evo_checkpoint: mock.fn(async (_name: string, _desc: string) => ({})),
  },
});

mock.module("./gitevo-integration.js", {
  namedExports: {
    spawnCandidate: mock.fn(async () => {}),
    adoptWinner: mock.fn(async () => {}),
    abandonLoser: mock.fn(async () => {}),
  },
});

mock.module("./gates.js", {
  namedExports: {
    GateRunner: class {
      async run(cmds: Record<string, string>) {
        return Object.entries(cmds).map(([gate]) => ({
          gate,
          passed: true,
          diagnostics: "ok",
          elapsed_ms: 0,
        }));
      }
    },
  },
});

mock.module("./judge.js", {
  namedExports: {
    compareBranches: mock.fn(async (_branches: any[], _task: string) => ({
      winner_branch: "branch-0",
      scores: {},
      rationale: "mock verdict",
    })),
  },
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("solve", () => {
  let solve: any;

  before(async () => {
    const mod = await import("./solve.js");
    solve = mod.solve;
  });

  // Reset between tests
  function reset() {
    verifyExitCode = 0;
    verifyOutput = "verification passed";
    proxyReady = true;
    hashCounter = 0;
    spawnClaudeExit = 0;
    spawnClaudeTimedOut = false;
    spawnClaudeEmptyOutput = false;
    costSnapshotCalls = 0;
    repairPromptCalls.length = 0;
    mockDiffOutput = null;
  }

  // ── Phase 1: First strategy passes → immediate return ───────────────────

  it("first strategy passes verification immediately", async () => {
    reset();
    verifyExitCode = 0;
    const result = await solve({ goal: "fix login", verify_cmd: "npm test", cwd: process.cwd() });
    assert.equal(result.outcome, "pass");
    assert.ok(result.patch);
    assert.ok(result.verification_report);
    assert.ok(result.stats.candidates_generated > 0);
  });

  // ── Phase 1: All strategies fail → repairs → escalation ─────────────────

  it("all strategies fail, repairs fail, escalates", async () => {
    reset();
    verifyExitCode = 1; // all verification fails

    const result = await solve({ goal: "fix login", verify_cmd: "npm test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");
    assert.ok(result.escalation);
    assert.ok(result.escalation.failure_signature);
    assert.ok(result.escalation.lineages_attempted > 0);
    assert.ok(result.escalation.summary.length > 0);
  });

  // ── Phase 1: Strategy passes after repair ───────────────────────────────

  it("repair loop triggers for failed strategies", async () => {
    reset();
    verifyExitCode = 1; // all fail → triggers repair loop → escalates

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    // All strategies fail, repairs also fail (verifyExitCode stays 1), escalates
    assert.equal(result.outcome, "escalate");
    assert.ok(result.stats.candidates_generated >= 5); // initial 5 + repair candidates
  });

  it("escalation report includes best partial output", async () => {
    reset();
    verifyExitCode = 2;
    verifyOutput = "some failure text here";

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");
    assert.ok(result.escalation.best_partial_patch);
    assert.ok(result.escalation.best_output || result.escalation.summary);
  });

  // ── Proxy not ready ─────────────────────────────────────────────────────

  it("warns when proxy not running", async () => {
    reset();
    proxyReady = false;
    verifyExitCode = 0;
    const calls: string[] = [];

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() }, (msg: string) =>
      calls.push(msg),
    );
    assert.equal(result.outcome, "pass");
    assert.ok(calls.some((c) => c.includes("WARNING")));
  });

  // ── onProgress ───────────────────────────────────────────────────────────

  it("calls onProgress throughout lifecycle", async () => {
    reset();
    verifyExitCode = 0;
    const calls: string[] = [];

    await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() }, (msg: string) => calls.push(msg));
    assert.ok(calls.some((c) => c.includes("Testing") || c.includes("spawning branch")));
    assert.ok(calls.some((c) => c.includes("completed") || c.includes("Verifying") || c.includes("PASSED")));
  });

  // ── stats populated correctly ────────────────────────────────────────────

  it("stats include duration and model", async () => {
    reset();
    verifyExitCode = 0;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd(), model: "claude-sonnet-5" });
    assert.equal(result.stats.model, "claude-sonnet-5");
    assert.ok(result.stats.duration_ms >= 0);
    assert.ok(result.stats.candidates_generated > 0);
  });

  it("stats include plans_sampled and plans_deduped", async () => {
    reset();
    verifyExitCode = 0;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    // numParallel=5, all 5 strategies distinct → no dedup
    assert.equal(result.stats.plans_sampled, 5);
    assert.equal(result.stats.plans_deduped, 5);
  });

  it("dedup removes duplicate strategies when fanout > 8", async () => {
    reset();
    verifyExitCode = 0;
    const result = await solve({
      goal: "fix",
      verify_cmd: "test",
      cwd: process.cwd(),
      fanout: 12,
    });
    // 12 plans sampled, but only 8 distinct strategies → dedup removes 4
    // (strategies 8=0, 9=1, 10=2, 11=3 are dupes of the 8 distinct ones)
    assert.equal(result.stats.plans_sampled, 12);
    assert.equal(result.stats.plans_deduped, 8);
    assert.ok(result.stats.plans_deduped < result.stats.plans_sampled);
    assert.equal(result.outcome, "pass");
  });

  // ── Timed out initial strategy ───────────────────────────────────────────

  it("skips timed-out initial strategies", async () => {
    reset();
    spawnClaudeTimedOut = true; // all strategies time out
    verifyExitCode = 0; // won't matter — timed out strategies aren't verified

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    // All timed out → no candidates → escalate
    assert.equal(result.outcome, "escalate");
  });

  // ── No-output lineage diagnostic ──────────────────────────────────────

  it("reports no_output diagnostic when claude -p produces no output", async () => {
    reset();
    spawnClaudeEmptyOutput = true;
    verifyExitCode = 1; // Ensure verification also fails so we hit escalation

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");
    assert.ok(result.escalation);
    // Lineage diagnostics should contain entries with final_status "no_output"
    const diags = result.escalation.lineage_diagnostics;
    assert.ok(diags && diags.length > 0, "expected lineage diagnostics");
    const noOutputDiags = diags.filter((d: any) => d.final_status === "no_output");
    assert.ok(noOutputDiags.length > 0, "expected at least one no_output diagnostic");
    assert.ok(noOutputDiags.every((d: any) => d.claude_no_output === true));
  });

  // ── Escalation: dominant signature detection ─────────────────────────────

  it("escalation report identifies dominant failure signature", async () => {
    reset();
    verifyExitCode = 1;
    hashCounter = 0;

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");
    // hashCounter advanced = signatures were generated
    assert.ok(result.escalation.failure_signature !== "unknown");
  });

  // ── Token tracking via per-lineage proxy cost ────────────────────────────

  it("tracks tokens via per-lineage proxy cost delta on pass", async () => {
    reset();
    verifyExitCode = 0;
    proxyReady = true;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "pass");
    // proxyTokenDelta returns 1500 per lineage, 5 strategies => 7500
    assert.equal(result.stats.tokens_consumed, 7500, `expected 7500 tokens, got ${result.stats.tokens_consumed}`);
  });

  it("tracks tokens via per-lineage proxy cost delta on escalation", async () => {
    reset();
    verifyExitCode = 1;
    proxyReady = true;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");
    // Each lineage calls proxyTokenDelta once: 5 * 1500 = 7500
    assert.equal(result.stats.tokens_consumed, 7500, `expected 7500 tokens, got ${result.stats.tokens_consumed}`);
  });

  // ── Per-lineage token tracking ──────────────────────────────────────────

  it("populates lineage_tokens in escalation diagnostics", async () => {
    reset();
    verifyExitCode = 1;
    proxyReady = true;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");
    assert.ok(result.escalation?.lineage_diagnostics, "expected lineage diagnostics");
    const diags = result.escalation!.lineage_diagnostics!;
    // Each lineage should have lineage_tokens set
    const allHaveTokens = diags.every((d: any) => d.lineage_tokens === 1500);
    assert.ok(allHaveTokens, "expected every lineage to report 1500 tokens");
  });

  // ── Direct mode cost display ───────────────────────────────────────────

  it("shows N/A (direct) when proxy not ready", async () => {
    reset();
    proxyReady = false;
    verifyExitCode = 0;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "pass");
    // proxyTokenDelta returns -1 when costBefore is null → totalLineageTokens stays -1
    assert.equal(result.stats.tokens_consumed, -1, `expected -1 for direct mode, got ${result.stats.tokens_consumed}`);
  });

  // ── Feedback compilation in repair path ─────────────────────────────────

  it("compiles structured feedback in repair loop", async () => {
    reset();
    verifyExitCode = 1; // trigger repair loop
    verifyOutput = "src/test.ts(42,10): error TS2345: Type 'string' is not assignable to type 'number'";

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");

    // repairPrompt should have been called with Diagnostic[] (not raw string)
    const calls = repairPromptCalls;
    assert.ok(calls.length > 0, "repairPrompt should be called in repair loop");
    for (const [, diagnostics] of calls) {
      assert.ok(Array.isArray(diagnostics), "second arg should be Diagnostic[]");
      assert.ok(diagnostics.length > 0, "should have at least one diagnostic");
      assert.ok(typeof diagnostics[0] === "object", "diagnostic should be an object");
      assert.ok("severity" in diagnostics[0], "diagnostic should have severity");
      assert.ok("message" in diagnostics[0], "diagnostic should have message");
    }
  });

  // ── Degenerate detection ──────────────────────────────────────────────

  it("rejects passing candidate with degenerate diff", async () => {
    reset();
    verifyExitCode = 0;
    // A diff with disabled_lint (block-level finding)
    mockDiffOutput = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,0 +1,2 @@",
      "+// eslint-disable-next-line no-eval",
      '+eval("unsafe")',
    ].join("\n");

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    // All 5 candidates pass verify but are degenerate → no passing branches → escalate
    assert.equal(result.outcome, "escalate");
    assert.ok(result.degenerate_rejections, "expected degenerate_rejections");
    assert.equal(result.degenerate_rejections!.length, 5, "all 5 candidates should be rejected as degenerate");
  });

  it("skips degenerate detection for empty diff", async () => {
    reset();
    verifyExitCode = 0;
    mockDiffOutput = ""; // empty diff → skip degenerate check

    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    // No diff → no degenerate signals → should pass
    assert.equal(result.outcome, "pass");
    assert.equal(result.degenerate_rejections, undefined, "no degenerate rejections for empty diff");
  });

  // ── Budget exhaustion ─────────────────────────────────────────────────

  it("budget exhaustion stops solve and returns escalate with report", async () => {
    reset();
    verifyExitCode = 1; // all fail
    const calls: string[] = [];
    const result = await solve(
      { goal: "fix", verify_cmd: "test", cwd: process.cwd(), budget_tokens: 1000 },
      (msg: string) => calls.push(msg),
    );
    // Budget exhausted after first lineage (1500 > 1000) → escalate
    assert.equal(result.outcome, "escalate");
    // Check for budget summary in progress output
    assert.ok(calls.some((c) => c.includes("Budget Summary")), "budget summary emitted");
    assert.ok(calls.some((c) => c.includes("BUDGET EXHAUSTED")), "budget exhaustion warning in summary");
  });

  // ── Lineage escalation through ladder ─────────────────────────────────

  it("lineage escalates through max attempts at retry rung", async () => {
    reset();
    verifyExitCode = 1; // all fail
    proxyReady = false; // disable proxy so there's no token tracking to isolate escalation logic
    // With all-false signals and proxy disabled, each lineage escalates
    // via max attempts: 3 at retry + 5 at resample = 8 repairs before re-decompose stop
    const calls: string[] = [];
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() }, (msg: string) => calls.push(msg));

    assert.equal(result.outcome, "escalate");
    // At least one lineage should have run repairs (escalation triggered)
    const anyRepairs = result.escalation!.lineage_diagnostics!.some((d: any) => d.repair_attempts! > 0);
    assert.ok(anyRepairs, "at least one lineage attempted repairs");
    // Each lineage advanced through retry + resample before stopping at re-decompose
    // → max repair_attempts for any lineage should be >= 3 (retry max)
    const maxRepairs = Math.max(...result.escalation!.lineage_diagnostics!.map((d: any) => d.repair_attempts ?? 0));
    assert.ok(maxRepairs >= 3, `expected at least 3 repairs per lineage (retry rung), got ${maxRepairs}`);
  });
});


// â”€â”€ detectScalarFitness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("detectScalarFitness", () => {
  let detectScalarFitness: any;

  before(async () => {
    const mod = await import("./solve.js");
    detectScalarFitness = mod.detectScalarFitness;
  });

  it("returns true when output has a number and exit 0", () => {
    const prevExit = verifyExitCode;
    const prevOutput = verifyOutput;
    verifyExitCode = 0;
    verifyOutput = "42.5";
    const result = detectScalarFitness("echo 42.5", process.cwd());
    assert.equal(result, true);
    verifyExitCode = prevExit;
    verifyOutput = prevOutput;
  });

  it("returns false when exit non-zero", () => {
    const prevExit = verifyExitCode;
    const prevOutput = verifyOutput;
    verifyExitCode = 1;
    verifyOutput = "error";
    const result = detectScalarFitness("failing cmd", process.cwd());
    assert.equal(result, false);
    verifyExitCode = prevExit;
    verifyOutput = prevOutput;
  });

  it("returns false when output has no numeric score", () => {
    const prevExit = verifyExitCode;
    const prevOutput = verifyOutput;
    verifyExitCode = 0;
    verifyOutput = "no digits here at all buddy";
    const result = detectScalarFitness("echo text", process.cwd());
    assert.equal(result, false);
    verifyExitCode = prevExit;
    verifyOutput = prevOutput;
  });
});

// â”€â”€ matchGlob / filesMatchGlob â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("matchGlob", () => {
  let matchGlob: any;

  before(async () => {
    const mod = await import("./solve.js");
    matchGlob = mod.matchGlob;
  });

  it("exact match", () => assert.equal(matchGlob("src/foo.ts", "src/foo.ts"), true));
  it("mismatch", () => assert.equal(matchGlob("src/foo.js", "src/foo.ts"), false));
  it("* matches within dir", () => assert.equal(matchGlob("src/foo.ts", "src/*.ts"), true));
  it("* does not cross dir boundary", () => assert.equal(matchGlob("src/sub/foo.ts", "src/*.ts"), false));
  it("** matches across dirs", () => assert.equal(matchGlob("src/sub/foo.ts", "src/**/*.ts"), true));
  it("** at root", () => assert.equal(matchGlob("src/foo.ts", "**/*.ts"), true));
  it("? matches single char", () => assert.equal(matchGlob("src/foo.ts", "src/fo?.ts"), true));
  it("? matches single char only", () => assert.equal(matchGlob("src/foox.ts", "src/fo?.ts"), false));
  it("multiple segments", () => {
    assert.equal(matchGlob("a/b/c.ts", "a/**/c.ts"), true);
    assert.equal(matchGlob("a/b/d.ts", "a/**/c.ts"), false);
  });
  it("empty pattern", () => assert.equal(matchGlob("src/foo.ts", ""), false));
});

describe("filesMatchGlob", () => {
  let filesMatchGlob: any;

  before(async () => {
    const mod = await import("./solve.js");
    filesMatchGlob = mod.filesMatchGlob;
  });

  const sampleDiff = [
    "diff --git a/src/app.ts b/src/app.ts",
    "index abc..def 100644",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,0 +1,2 @@",
    "+const x = 1;",
    "diff --git a/src/utils/helper.ts b/src/utils/helper.ts",
    "--- a/src/utils/helper.ts",
    "+++ b/src/utils/helper.ts",
    "@@ -1,0 +1,2 @@",
    "+export const help = true;",
    "diff --git a/package.json b/package.json",
    "--- a/package.json",
    "+++ b/package.json",
    "@@ -1,0 +1,2 @@",
    '+  "version": "2.0.0"',
  ].join("\n");

  it("returns empty when all files match patterns", () => {
    const v = filesMatchGlob(sampleDiff, ["src/**/*.ts", "package.json"]);
    assert.deepEqual(v, []);
  });

  it("returns violating file when pattern doesn't match", () => {
    const v = filesMatchGlob(sampleDiff, ["src/**/*.ts"]);
    assert.deepEqual(v, ["package.json"]);
  });

  it("returns empty with no patterns", () => {
    const v = filesMatchGlob(sampleDiff, []);
    assert.deepEqual(v, []);
  });

  it("matches all when pattern is **/*", () => {
    const v = filesMatchGlob(sampleDiff, ["**/*"]);
    assert.deepEqual(v, []);
  });

  it("reports multiple violations", () => {
    const v = filesMatchGlob(sampleDiff, ["src/app.ts"]);
    assert.deepEqual(v.sort(), ["package.json", "src/utils/helper.ts"]);
  });

  it("handles empty diff", () => {
    const v = filesMatchGlob("", ["src/**/*.ts"]);
    assert.deepEqual(v, []);
  });
});

// â”€â”€ Allowed files enforcement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("allowed_files enforcement", () => {
  let solve: any;

  before(async () => {
    const mod = await import("./solve.js");
    solve = mod.solve;
  });

  function resetAE() {
    verifyExitCode = 0;
    verifyOutput = "verification passed";
    proxyReady = true;
    hashCounter = 0;
    spawnClaudeExit = 0;
    spawnClaudeTimedOut = false;
    spawnClaudeEmptyOutput = false;
    costSnapshotCalls = 0;
    repairPromptCalls.length = 0;
    mockDiffOutput = null;
  }

  it("rejects candidate that touches files outside allowed_files", async () => {
    resetAE();
    verifyExitCode = 0;
    // Diff includes package.json but allowed_files excludes it
    mockDiffOutput = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,0 +1,2 @@",
      "+const x = 1;",
      "diff --git a/package.json b/package.json",
      "--- a/package.json",
      "+++ b/package.json",
      "@@ -1,0 +1,2 @@",
      '+  "version": "2.0.0"',
    ].join("\n");

    const result = await solve({
      goal: "fix",
      verify_cmd: "test",
      cwd: process.cwd(),
      allowed_files: ["src/**/*.ts"],
    });

    assert.equal(result.outcome, "escalate", "should escalate when all candidates touch disallowed files");
    assert.ok(result.degenerate_rejections, "expected degenerate_rejections");
    assert.ok(
      result.degenerate_rejections!.some((r: string) => r.includes("allowed_files")),
      "rejection should mention allowed_files",
    );
  });

  it("accepts candidate when all touched files are within allowed_files", async () => {
    resetAE();
    verifyExitCode = 0;
    mockDiffOutput = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,0 +1,2 @@",
      "+const x = 1;",
    ].join("\n");

    const result = await solve({
      goal: "fix",
      verify_cmd: "test",
      cwd: process.cwd(),
      allowed_files: ["src/**/*.ts"],
    });

    assert.equal(result.outcome, "pass", "should pass when all changes are within allowed_files");
  });

  it("skips allowed_files check when no pattern provided", async () => {
    resetAE();
    verifyExitCode = 0;
    mockDiffOutput = [
      "diff --git a/package.json b/package.json",
      "--- a/package.json",
      "+++ b/package.json",
      "@@ -1,0 +1,2 @@",
      '+  "version": "2.0.0"',
    ].join("\n");

    const result = await solve({
      goal: "fix",
      verify_cmd: "test",
      cwd: process.cwd(),
      // no allowed_files set
    });

    assert.equal(result.outcome, "pass", "should pass when allowed_files not set");
  });
});
