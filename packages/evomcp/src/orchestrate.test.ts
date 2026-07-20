/**
 * Tests for orchestrate.ts — orchestrator-driven solve lifecycle.
 *
 * Mocks solve.js so orchestrate flows can be tested without spawning
 * claude -p subprocesses. Tests focus on stage sequencing, gate
 * enforcement, and integration points (mutation_cmd, held_out_tests).
 */

import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

// ── Mock state ────────────────────────────────────────────────────────────

let solveOutcome = "pass";
const solveCallArgs: unknown[] = [];
let runCommandExitCode = 0;
let runCommandOutput = "";

// ── Mock solve.js — intercept the import from orchestrate.ts ─────────────

mock.module("./solve.js", {
  namedExports: {
    solve: mock.fn(async (_spec: unknown) => {
      solveCallArgs.push(_spec);
      return {
        outcome: solveOutcome,
        patch: "mock patch content\nmock diff line",
        verification_report: "mock verification report",
        stats: {
          plans_sampled: 5,
          plans_deduped: 5,
          candidates_generated: 10,
          tokens_consumed: 15000,
          duration_ms: 5000,
          model: "test-model",
        },
      };
    }),
  },
});

// ── Mock agent.js — runCommand used by harden/merge stages ───────────────

mock.module("./agent.js", {
  namedExports: {
    runCommand: mock.fn((_cmd: string, _cwd: string, _timeout?: number) => ({
      output: runCommandOutput || "mock command output",
      exitCode: runCommandExitCode,
      durationMs: 10,
    })),
  },
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("orchestrate", () => {
  let orchestrateSolve: any;

  before(async () => {
    const mod = await import("./orchestrate.js");
    orchestrateSolve = mod.orchestrateSolve;
  });

  function reset() {
    solveOutcome = "pass";
    solveCallArgs.length = 0;
    runCommandExitCode = 0;
    runCommandOutput = "";
  }

  // ── Full lifecycle ──────────────────────────────────────────────────

  it("drives through all 6 stages in order when solve passes", async () => {
    reset();
    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
    });

    assert.equal(result.outcome, "pass");
    assert.equal(result.stages.length, 6, "should have 6 stage results");

    const stageNames = result.stages.map((s: any) => s.stage);
    assert.deepEqual(stageNames, ["spec", "test_author", "implement", "harden", "review", "merge"]);

    // Default stage statuses
    assert.equal(result.stages[0].status, "human_gate"); // spec
    assert.equal(result.stages[1].status, "human_gate"); // test_author
    assert.equal(result.stages[2].status, "passed"); // implement
    assert.equal(result.stages[3].status, "human_gate"); // harden (no mutation_cmd)
    assert.equal(result.stages[4].status, "human_gate"); // review
    assert.equal(result.stages[5].status, "passed"); // merge
  });

  it("produces outcome=pass when all stages complete", async () => {
    reset();
    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
    });

    assert.equal(result.outcome, "pass");
    assert.ok(result.summary.includes("Completed: YES"), "summary should show completed");
  });

  // ── solveResult integration ─────────────────────────────────────────

  it("stores solve result in result.solveResult", async () => {
    reset();
    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
    });

    assert.ok(result.solveResult);
    const sr = result.solveResult as { outcome: string; patch: string };
    assert.equal(sr.outcome, "pass");
    assert.equal(sr.patch, "mock patch content\nmock diff line");
  });

  it("passes the spec to solve()", async () => {
    reset();
    await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
      context: "extra context",
    });

    assert.ok(solveCallArgs.length > 0);
    const spec = solveCallArgs[0] as { goal: string; context?: string };
    assert.equal(spec.goal, "fix login");
    assert.equal(spec.context, "extra context");
  });

  // ── Solve failure -> escalation ─────────────────────────────────────

  it("escalates when solve fails", async () => {
    reset();
    solveOutcome = "escalate";

    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
    });

    assert.equal(result.outcome, "escalate");
    // Should include spec, test_author, implement stages
    const stageNames = result.stages.map((s: any) => s.stage);
    assert.ok(stageNames.includes("spec"));
    assert.ok(stageNames.includes("test_author"));
    assert.ok(stageNames.includes("implement"));

    // implement should be failed
    const implementStage = result.stages.find((s: any) => s.stage === "implement");
    assert.ok(implementStage);
    assert.equal(implementStage.status, "failed");
  });

  // ── Mutation testing ─────────────────────────────────────────────────

  it("runs mutation_cmd in harden stage", async () => {
    reset();
    runCommandExitCode = 0;

    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
      mutation_cmd: "npx stryker run",
    });

    assert.equal(result.outcome, "pass");
    const hardenStage = result.stages.find((s: any) => s.stage === "harden");
    assert.ok(hardenStage);
    assert.equal(hardenStage.status, "passed");
    assert.match(hardenStage.message ?? "", /passed/);
  });

  it("reports mutation failure in harden stage", async () => {
    reset();
    runCommandExitCode = 2;
    runCommandOutput = "Killed: 0/100 mutants";

    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
      mutation_cmd: "npx stryker run",
    });

    // Mutation failure doesn't abort — it reports the failure
    const hardenStage = result.stages.find((s: any) => s.stage === "harden");
    assert.ok(hardenStage);
    assert.equal(hardenStage.status, "failed");
    assert.match(hardenStage.message ?? "", /failed/);
  });

  // ── Held-out tests ───────────────────────────────────────────────────

  it("runs held_out_tests in merge stage", async () => {
    reset();
    runCommandExitCode = 0;

    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
      held_out_tests: "npx vitest run --testPathPattern=tests/hidden",
    });

    assert.equal(result.outcome, "pass");
    const mergeStage = result.stages.find((s: any) => s.stage === "merge");
    assert.ok(mergeStage);
    assert.equal(mergeStage.status, "passed");
    assert.match(mergeStage.message ?? "", /passed/);
  });

  it("aborts when held_out_tests fail", async () => {
    reset();
    runCommandExitCode = 1;
    runCommandOutput = "FAIL tests/hidden/auth.test.ts";

    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
      held_out_tests: "npx vitest run hidden",
    });

    assert.equal(result.outcome, "escalate");
    const mergeStage = result.stages.find((s: any) => s.stage === "merge");
    assert.ok(mergeStage);
    assert.equal(mergeStage.status, "failed");
    assert.match(mergeStage.message ?? "", /failed/);
  });

  // ── Progress reporting ───────────────────────────────────────────────

  it("calls onProgress throughout lifecycle", async () => {
    reset();
    const calls: string[] = [];

    await orchestrateSolve(
      { goal: "fix login", verify_cmd: "npm test", cwd: process.cwd(), playbook: "bugfix" },
      (msg: string) => calls.push(msg),
    );

    assert.ok(
      calls.some((c) => c.includes("Specification")),
      "should mention spec stage",
    );
    assert.ok(
      calls.some((c) => c.includes("Implementation")),
      "should mention implement stage",
    );
    assert.ok(
      calls.some((c) => c.includes("Merge")),
      "should mention merge stage",
    );
  });

  // ── Gate enforcement via orchestrator flags ─────────────────────────

  it("includes stage results with per-stage status and timing", async () => {
    reset();
    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
    });

    // All stages should have ms set
    for (const s of result.stages as any[]) {
      assert.ok(s.ms !== undefined, `${s.stage} should have timing`);
    }

    // Summary should be populated
    assert.ok(result.summary.length > 0);
    assert.ok(result.summary.includes("Stage Results"));
  });

  // ── Summary contains orchestrator status info ───────────────────────

  it("summary includes orchestrator status information", async () => {
    reset();
    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
    });

    assert.ok(result.summary.includes("Stage:"));
    assert.ok(result.summary.includes("Flags"));
  });

  // ── Multiple playbook types accepted ─────────────────────────────────

  it("accepts all playbook types", async () => {
    reset();
    for (const playbook of ["bugfix", "feature", "refactor", "test-harden", "reconcile", "review"] as const) {
      const result = await orchestrateSolve({
        goal: "test",
        verify_cmd: "echo ok",
        cwd: process.cwd(),
        playbook,
      });
      assert.equal(result.outcome, "pass");
    }
  });

  // ── Token tracking ──────────────────────────────────────────────────

  it("tracks solve tokens in implement stage", async () => {
    reset();
    const result = await orchestrateSolve({
      goal: "fix login",
      verify_cmd: "npm test",
      cwd: process.cwd(),
      playbook: "bugfix",
    });

    const implementStage = result.stages.find((s: any) => s.stage === "implement");
    assert.ok(implementStage);
    assert.equal(implementStage.tokens, 15000);
  });

  // ── Real solve flow with all stages ──────────────────────────────────

  it("handles the happy path: spec->test->implement->harden->review->merge", async () => {
    reset();
    const result = await orchestrateSolve({
      goal: "add user authentication",
      verify_cmd: "npm run test:auth",
      cwd: process.cwd(),
      playbook: "feature",
      mutation_cmd: "npx stryker run --mutate src/auth/**/*.ts",
      held_out_tests: "npm run test:e2e",
    });

    assert.equal(result.outcome, "pass");
    assert.equal(result.stages.length, 6);

    // Verify specific stage outcomes
    const hardenStage = result.stages.find((s: any) => s.stage === "harden");
    assert.ok(hardenStage);
    assert.equal(hardenStage.status, "passed"); // mutation_cmd was provided and exits 0
  });
});
