import * as assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

// ── Mock state ────────────────────────────────────────────────────────────

let proxyReady = true;
let spawnShouldThrow = false;
let spawnTimedOut = false;
let extractScoreNull = false;
let runCmdBaseOutput = "42.5";
let useProgressiveScores = false;
let runCmdCall = 0;
let runCmdMutationStep = 0;

mock.module("./agent.js", {
  namedExports: {
    ensureProxy: mock.fn(async () => proxyReady),
    runCommand: mock.fn((_cmd: string, _cwd: string) => {
      runCmdCall++;
      if (!useProgressiveScores || runCmdCall === 1) return { output: runCmdBaseOutput, exitCode: 0 };
      const base = Number.parseInt(runCmdBaseOutput, 10);
      const val = base - runCmdCall + 1 - runCmdMutationStep;
      return { output: String(val), exitCode: 0 };
    }),
    spawnClaude: mock.fn(async (_p: string, _o: any) => {
      if (spawnShouldThrow) throw new Error("spawn failed");
      return {
        output: spawnTimedOut ? "" : "mutation",
        exitCode: spawnTimedOut ? -1 : 0,
        durationMs: spawnTimedOut ? 180000 : 100,
        timedOut: spawnTimedOut,
      };
    }),
    extractScore: mock.fn((output: string) => {
      if (extractScoreNull) return null;
      const m = output.match(/-?\d+(\.\d+)?/);
      return m ? Number.parseFloat(m[0]) : null;
    }),
    mutationPrompt: mock.fn(() => "mutation prompt"),
    getProxyCost: mock.fn(async () => null),
  },
});

mock.module("node:child_process", {
  namedExports: {
    execSync: mock.fn((cmd: string) => {
      const s = String(cmd);
      if (s.includes("git diff")) return Buffer.from("mock patch diff\n+improved");
      if (s.includes("git stash push")) return Buffer.from("Saved");
      if (s.includes("git stash pop")) throw Object.assign(new Error("No stash entries found."), { status: 1 });
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
    checkpointGeneration: mock.fn(async () => {}),
    spawnCandidate: mock.fn(async () => {}),
    adoptWinner: mock.fn(async () => {}),
    abandonLoser: mock.fn(async () => {}),
  },
});

mock.module("./gates.js", {
  namedExports: {
    GateRunner: class {
      async run(cmds: Record<string, string>): Promise<import("./types.js").GateResult[]> {
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

mock.module("./convergence.js", {
  namedExports: {
    checkConvergence: mock.fn((_history: any[], _opts?: any) => ({
      converged: false,
      stagnated: false,
      oscillating: false,
      convergence: { converged: false, similarity: 0, threshold: 0.1, reason: "" },
      stagnation: {
        stagnated: false,
        generations_without_improvement: 0,
        patience: 3,
        best_in_window: 0,
        overall_best: 0,
        reason: "",
      },
      oscillation: { oscillating: false, pattern: "none" as const, amplitude: 0, reason: "" },
      recommendation: "continue" as const,
    })),
  },
});

// ── matchSimple ───────────────────────────────────────────────────────────

describe("matchSimple", () => {
  let matchSimple: (n: string, p: string) => boolean;
  before(async () => {
    ({ matchSimple } = await import("./evolve.js"));
  });

  it("exact match", () => assert.equal(matchSimple("foo.ts", "foo.ts"), true));
  it("mismatch", () => assert.equal(matchSimple("foo.ts", "bar.ts"), false));
  it("wildcard * matches any chars", () => {
    assert.equal(matchSimple("foo.ts", "*.ts"), true);
    assert.equal(matchSimple("foo.js", "*.ts"), false);
  });
  it("wildcard * matches zero chars", () => assert.equal(matchSimple(".ts", "*.ts"), true));
  it("escapes literal dots", () => {
    assert.equal(matchSimple("fooXts", "foo.ts"), false);
    assert.equal(matchSimple("foo.ts", "foo.ts"), true);
  });
  it("multiple wildcards", () => {
    assert.equal(matchSimple("foo.bar.ts", "*.*.ts"), true);
    assert.equal(matchSimple("foo.ts", "*.*.ts"), false);
  });
  it("wildcard at start", () => {
    assert.equal(matchSimple("index.ts", "*.ts"), true);
    assert.equal(matchSimple("index.test.ts", "*.test.ts"), true);
    assert.equal(matchSimple("index.ts", "*.test.ts"), false);
  });
  it("pattern char class", () => assert.equal(matchSimple("foo1.ts", "foo[1].ts"), true));
  it("pattern-only wildcard", () => assert.equal(matchSimple("anything.txt", "*"), true));
  it("empty name", () => {
    assert.equal(matchSimple("", ""), true);
    assert.equal(matchSimple("", "*.ts"), false);
  });
  it("disallows path traversal", () => assert.equal(matchSimple("../../etc/passwd", "*.ts"), false));
  it("multiple stars greedy", () => assert.equal(matchSimple("a.b.c.ts", "*.*.*.ts"), true));
});

// ── evolve ────────────────────────────────────────────────────────────────

describe("evolve", () => {
  let evolveFn: any;

  beforeEach(async () => {
    proxyReady = true;
    spawnShouldThrow = false;
    spawnTimedOut = false;
    extractScoreNull = false;
    runCmdBaseOutput = "42.5";
    useProgressiveScores = false;
    runCmdCall = 0;
    runCmdMutationStep = 0;
    evolveFn = (await import("./evolve.js")).evolve;
  });

  // error paths
  it("throws on no numeric score", async () => {
    extractScoreNull = true;
    await assert.rejects(
      () => evolveFn({ goal: "t", fitness_cmd: "echo nope", cwd: process.cwd(), target_files: ["package.json"] }),
      /did not emit a numeric score/,
    );
  });

  it("throws on no target files", async () => {
    await assert.rejects(
      () => evolveFn({ goal: "t", fitness_cmd: "echo 42", cwd: process.cwd(), target_files: ["nonexistent_*.zzz"] }),
      /No target files found/,
    );
  });

  // happy path
  it("full evolution run", async () => {
    const r = await evolveFn({
      goal: "x",
      fitness_cmd: "echo 42.5",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 2,
      population_size: 2,
    });
    assert.ok(r.best_patch !== null);
    assert.equal(r.fitness_history.length, 2);
    assert.ok(r.stats.candidates_generated > 0);
  });

  it("proxy down works", async () => {
    proxyReady = false;
    runCmdBaseOutput = "100";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 100",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 1,
    });
    assert.equal(r.best_score, 100);
  });

  it("fitness_history per gen", async () => {
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 10",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 3,
      population_size: 1,
    });
    assert.equal(r.fitness_history.length, 3);
  });

  it("onProgress called", async () => {
    runCmdBaseOutput = "20";
    const calls: string[] = [];
    await evolveFn(
      {
        goal: "t",
        fitness_cmd: "echo 20",
        cwd: process.cwd(),
        target_files: ["package.json"],
        generations: 1,
        population_size: 1,
      },
      (m: string) => calls.push(m),
    );
    assert.ok(calls.some((c: string) => c.includes("Baseline")));
    assert.ok(calls.some((c: string) => c.includes("Generation")));
  });

  it("verification_report", async () => {
    runCmdBaseOutput = "15";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 15",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 1,
    });
    assert.ok(r.verification_report.includes("Baseline:"));
    assert.ok(r.verification_report.includes("Final:"));
    assert.ok(r.verification_report.includes("Improvement:"));
  });

  it("model override in stats", async () => {
    runCmdBaseOutput = "5";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 5",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 1,
      model: "claude-sonnet-5",
    });
    assert.equal(r.stats.model, "claude-sonnet-5");
  });

  it("default gens+pop", async () => {
    runCmdBaseOutput = "1";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 1",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 2,
      population_size: 2,
    });
    assert.equal(r.fitness_history.length, 2);
  });

  // edge cases
  it("timed-out mutations skipped", async () => {
    spawnTimedOut = true;
    runCmdBaseOutput = "30";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 30",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 2,
    });
    assert.equal(r.best_score, 30);
  });

  it("spawn failures caught", async () => {
    spawnShouldThrow = true;
    runCmdBaseOutput = "50";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 50",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 2,
      population_size: 2,
    });
    assert.equal(r.best_score, 50);
  });

  it("glob pattern targets", async () => {
    runCmdBaseOutput = "99";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 99",
      cwd: process.cwd(),
      target_files: ["*.json"],
      generations: 1,
      population_size: 1,
    });
    assert.equal(r.best_score, 99);
  });

  it("1 gen 1 pop", async () => {
    runCmdBaseOutput = "7";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 7",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 1,
    });
    assert.equal(r.fitness_history.length, 1);
    assert.equal(r.best_score, 7);
  });

  // coverage gaps: progressive scores
  it("tracks improving scores (lower=better)", async () => {
    runCmdBaseOutput = "100";
    useProgressiveScores = true;
    const r = await evolveFn({
      goal: "min",
      fitness_cmd: "echo 100",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 2,
      population_size: 2,
    });
    assert.ok(r.best_score < 100, `expected improvement, got ${r.best_score}`);
    assert.ok(r.best_patch !== "(no improvement over baseline)");
  });

  it("higher_is_better selects larger", async () => {
    runCmdBaseOutput = "10";
    useProgressiveScores = true;
    runCmdMutationStep = -20;
    const r = await evolveFn({
      goal: "max",
      fitness_cmd: "echo 10",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 2,
      higher_is_better: true,
    });
    assert.ok(r.best_score > 10, `expected higher than 10, got ${r.best_score}`);
  });

  it("mean_score fallback when all timed out", async () => {
    spawnTimedOut = true;
    runCmdBaseOutput = "42";
    const r = await evolveFn({
      goal: "t",
      fitness_cmd: "echo 42",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 3,
    });
    assert.equal(r.fitness_history[0].mean_score, 42);
  });

  it("bestPatch applied between gens", async () => {
    runCmdBaseOutput = "50";
    useProgressiveScores = true;
    const r = await evolveFn({
      goal: "min",
      fitness_cmd: "echo 50",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 2,
      population_size: 2,
    });
    assert.ok(r.best_patch.includes("evolve-gen"), `expected branch name in best_patch, got: ${r.best_patch}`);
    assert.ok(r.best_score < 50);
  });

  it("final phase applies bestPatch", async () => {
    runCmdBaseOutput = "50";
    useProgressiveScores = true;
    const r = await evolveFn({
      goal: "min",
      fitness_cmd: "echo 50",
      cwd: process.cwd(),
      target_files: ["package.json"],
      generations: 1,
      population_size: 2,
    });
    assert.ok(r.best_patch !== "(no improvement over baseline)", `got: ${r.best_patch}`);
  });
});
