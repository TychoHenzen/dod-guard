/**
 * Characterization tests for four evolve.ts behaviors the main suite
 * (evolve.test.ts) never exercises. Its mocks are hardcoded to the
 * "everything continues, everything passes" path. Each mock here is
 * driven by a mutable flag, so a single case can flip it.
 *
 * This lives in its own file, not appended to evolve.test.ts. Node's
 * test runner isolates each matched file into its own process. A
 * separate mock.module registry here cannot collide with the one in
 * evolve.test.ts. Extending the existing hardcoded mocks in place
 * (GateRunner.runAll, adoptWinner, checkConvergence) would have meant
 * touching mocks that several existing cases rely on staying fixed.
 */

import * as assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

// ── Mock state ────────────────────────────────────────────────────────────

let runCmdCall = 0;
let runCmdFirstOutput = "50";
let runCmdLaterOutput = "50";

let convergenceRecommendation: "continue" | "stop" = "continue";
let convergenceReason = "";

let gatesShouldFail = false;

let adoptWinnerShouldThrow = false;

let inFlight = 0;
let peakInFlight = 0;
let spawnDelayMs = 15;

mock.module("./agent.js", {
  namedExports: {
    ensureProxy: mock.fn(async () => true),
    runCommand: mock.fn((_cmd: string, _cwd: string) => {
      runCmdCall++;
      const output = runCmdCall === 1 ? runCmdFirstOutput : runCmdLaterOutput;
      return { output, exitCode: 0 };
    }),
    spawnClaude: mock.fn(async (_p: string, _o: any) => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((r) => setTimeout(r, spawnDelayMs));
      inFlight--;
      return { output: "mutation", exitCode: 0, durationMs: spawnDelayMs, timedOut: false };
    }),
    extractScore: mock.fn((output: string) => {
      const m = output.match(/-?\d+(\.\d+)?/);
      return m ? Number.parseFloat(m[0]) : null;
    }),
    mutationPrompt: mock.fn(() => "mutation prompt"),
    getProxyCost: mock.fn(async () => ({
      backends: { deepseek: { input_tokens: 100, output_tokens: 50, requests: 1 } },
      total_tokens: 150,
      total_cost: 0.0001,
    })),
    proxyTokenDelta: mock.fn(async (_costBefore: any) => 150),
  },
});

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((cmd: string) => {
      const s = String(cmd);
      if (s.includes("git diff")) return "mock patch diff\n+improved";
      if (s.includes("git stash push")) return Buffer.from("Saved");
      if (s.includes("git stash pop")) throw Object.assign(new Error("No stash entries found."), { status: 1 });
      return Buffer.from("");
    }),
  },
});

mock.module("../../gitevo/dist/operations.js", {
  namedExports: {
    evo_checkpoint: mock.fn(async (_name: string, _desc: string) => ({})),
  },
});

mock.module("./gitevo-integration.js", {
  namedExports: {
    checkpointGeneration: mock.fn(async () => {}),
    spawnCandidate: mock.fn(async () => {}),
    adoptWinner: mock.fn(async (_branch: string, _cwd: string) => {
      if (adoptWinnerShouldThrow) throw new Error("gitevo adopt: dirty tree");
    }),
    abandonLoser: mock.fn(async () => {}),
  },
});

mock.module("./gates.js", {
  namedExports: {
    GateRunner: class {
      async runAll(_cwd: string): Promise<import("./types.js").GateResult[]> {
        if (gatesShouldFail) {
          return [{ gate: "build", passed: false, diagnostics: "build failed", elapsed_ms: 1 }];
        }
        return [{ gate: "build", passed: true, diagnostics: "", elapsed_ms: 1 }];
      }
    },
  },
});

mock.module("./convergence.js", {
  namedExports: {
    checkConvergence: mock.fn((_history: any[], _scores: any[]) => ({
      converged: convergenceRecommendation === "stop",
      stagnated: false,
      oscillating: false,
      convergence: {
        converged: convergenceRecommendation === "stop",
        similarity: 0,
        threshold: 0.1,
        reason: convergenceReason,
      },
      stagnation: {
        stagnated: false,
        generations_without_improvement: 0,
        patience: 3,
        best_in_window: 0,
        overall_best: 0,
        reason: "",
      },
      oscillation: { oscillating: false, pattern: "none" as const, amplitude: 0, reason: "" },
      recommendation: convergenceRecommendation,
    })),
  },
});

// ── evolve gap cases ─────────────────────────────────────────────────────

describe("evolve gaps", () => {
  let evolveFn: any;

  beforeEach(async () => {
    runCmdCall = 0;
    runCmdFirstOutput = "50";
    runCmdLaterOutput = "50";
    convergenceRecommendation = "continue";
    convergenceReason = "";
    gatesShouldFail = false;
    adoptWinnerShouldThrow = false;
    inFlight = 0;
    peakInFlight = 0;
    spawnDelayMs = 15;
    evolveFn = (await import("./evolve.js")).evolve;
  });

  // 1. Convergence stops the run early.
  it("stops the generation loop early when convergence reports stop", async () => {
    runCmdFirstOutput = "30";
    runCmdLaterOutput = "30";
    convergenceRecommendation = "stop";
    convergenceReason = "TEST_CONVERGED_REASON";

    const r = await evolveFn({
      goal: "min",
      fitness_cmd: "echo 30",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 5,
      population_size: 1,
    });

    assert.equal(r.fitness_history.length, 1, "loop should stop after the first generation, not run all 5");
    assert.equal(r.converged, true);
    assert.equal(r.convergence_reason, "TEST_CONVERGED_REASON");
    assert.equal(r.best_score, 30, "best score so far should still be reported");
  });

  // 2. A failing gate rejects a winning candidate.
  it("does not adopt a candidate with a winning score when its gate fails", async () => {
    runCmdFirstOutput = "50"; // baseline
    runCmdLaterOutput = "10"; // candidate: numerically better (lower = better by default)
    gatesShouldFail = true;

    const r = await evolveFn({
      goal: "min",
      fitness_cmd: "echo 50",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 1,
      build_cmd: "echo build",
    });

    assert.equal(r.fitness_history[0].best_score, 50, "gate-failed candidate must not become the new best");
    assert.equal(r.best_patch, "(no improvement over baseline)", "gate-failed candidate must not be adopted");
  });

  // 3. Winner adoption fails and the run falls back, still returning the improvement.
  it("falls back and still returns the winning branch when adoptWinner throws", async () => {
    runCmdFirstOutput = "50"; // baseline
    runCmdLaterOutput = "10"; // candidate: better
    adoptWinnerShouldThrow = true;

    const r = await evolveFn({
      goal: "min",
      fitness_cmd: "echo 50",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 1,
    });

    assert.equal(
      r.best_patch,
      "evolve-gen0-candidate0",
      "run should still report the winning branch despite adopt failure",
    );
  });

  // 4. Mutation calls run under a concurrency cap.
  it("never runs more than 4 mutation calls at once within a generation", async () => {
    runCmdFirstOutput = "5";
    runCmdLaterOutput = "5";

    await evolveFn({
      goal: "t",
      fitness_cmd: "echo 5",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 8,
    });

    assert.ok(peakInFlight <= 4, `concurrency cap exceeded: peak was ${peakInFlight}`);
    assert.equal(peakInFlight, 4, "with 8 candidates and cap 4, peak concurrency should reach the cap");
  });
});
