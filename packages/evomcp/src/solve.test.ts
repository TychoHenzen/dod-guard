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

mock.module("./agent.js", {
  namedExports: {
    ensureProxy: mock.fn(async () => proxyReady),
    hashFailure: mock.fn((_output: string) => `hash-${hashCounter++}`),
    repairPrompt: mock.fn(
      (task: string, failure: string, attempt: number) => `repair|${task}|${attempt}|${failure.slice(0, 50)}`,
    ),
    runCommand: mock.fn((_cmd: string, _cwd: string) => ({
      output: verifyOutput,
      exitCode: verifyExitCode,
      durationMs: 10,
    })),
    spawnClaude: mock.fn(async (_p: string, _o: any) => ({
      output: "spawn output",
      exitCode: spawnClaudeExit,
      durationMs: 100,
      timedOut: spawnClaudeTimedOut,
    })),
    spawnClaudeN: mock.fn(async (_prompts: string[], _o: any) =>
      _prompts.map(() => {
        if (spawnClaudeEmptyOutput) return { output: "", exitCode: 0, durationMs: 100, timedOut: false };
        return {
          output: "strategy output",
          exitCode: spawnClaudeExit,
          durationMs: 100,
          timedOut: spawnClaudeTimedOut,
        };
      }),
    ),
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
  },
});

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((_cmd: string, _opts?: any) => Buffer.from("mock git diff output")),
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
    assert.ok(calls.some((c) => c.includes("Spawning")));
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
    assert.ok(result.stats.plans_sampled > 0);
    assert.ok(result.stats.plans_deduped > 0);
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

  // ── Token tracking via proxy cost snapshot ────────────────────────────

  it("tracks tokens via proxy cost delta on pass", async () => {
    reset();
    verifyExitCode = 0;
    proxyReady = true;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "pass");
    // The getProxyCost mock returns increasing values, so delta should be > 0
    assert.ok(result.stats.tokens_consumed > 0, `expected tokens_consumed > 0, got ${result.stats.tokens_consumed}`);
    // costSnapshotCalls should be >= 2 (before + after)
    assert.ok(costSnapshotCalls >= 2, `expected >=2 cost snapshots, got ${costSnapshotCalls}`);
  });

  it("tracks tokens via proxy cost delta on escalation", async () => {
    reset();
    verifyExitCode = 1;
    proxyReady = true;
    const result = await solve({ goal: "fix", verify_cmd: "test", cwd: process.cwd() });
    assert.equal(result.outcome, "escalate");
    assert.ok(result.stats.tokens_consumed > 0, `expected tokens_consumed > 0, got ${result.stats.tokens_consumed}`);
  });
});
