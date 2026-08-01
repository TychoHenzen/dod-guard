import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import type { AttemptResult } from "./attempt-result.js";
import type { SolvePlan } from "./solve-plan.js";
import type { SolveSession } from "./solve-session.js";

/** Branch names handed to the gitevo spawn, in order. */
const spawnedBranches: string[] = [];
let spawnThrows = false;
let checkoutOk = true;

/** Prompts and timeouts handed to the worker, in order. */
const workerCalls: { prompt: string; timeoutMs: number }[] = [];
let worker = { output: "did the work", exitCode: 0, durationMs: 5, timedOut: false };

/** Commit messages, in order. */
const commits: string[] = [];
/** Diff ranges, in order. */
const ranges: string[] = [];

let verifyPasses = true;
let verifyThrows = false;
/** Plan indexes handed to the repair loop, in order. */
const repairs: number[] = [];

let proxyCostCalls = 0;
let tokenDelta = 777;
/** The cost snapshot the delta was measured against, per call. */
const deltaArgs: unknown[] = [];

mock.module("./agent.js", {
  namedExports: {
    getProxyCost: mock.fn(async () => {
      proxyCostCalls++;
      return { total: 100 };
    }),
    proxyTokenDelta: mock.fn(async (before: unknown) => {
      deltaArgs.push(before);
      return tokenDelta;
    }),
  },
});

mock.module("./gitevo-integration.js", {
  namedExports: {
    spawnCandidate: mock.fn(async (_checkpoint: string, branch: string) => {
      spawnedBranches.push(branch);
      if (spawnThrows) throw new Error("no checkpoint");
    }),
  },
});

mock.module("./solve-git.js", {
  namedExports: {
    checkoutBranch: mock.fn(() => checkoutOk),
    captureDiff: mock.fn((_cwd: string, range: string) => {
      ranges.push(range);
      return "the diff";
    }),
    commitCandidate: mock.fn((_cwd: string, message: string) => {
      commits.push(message);
    }),
  },
});

mock.module("./solve-worker.js", {
  namedExports: {
    FIRST_TIMEOUT_MS: 300_000,
    spawnWorker: mock.fn(async (prompt: string, _session: SolveSession, timeoutMs: number) => {
      workerCalls.push({ prompt, timeoutMs });
      return worker;
    }),
  },
});

mock.module("./solve-verify.js", {
  namedExports: {
    runVerification: mock.fn(async () => {
      if (verifyThrows) throw new Error("verify blew up");
      return verifyPasses
        ? { passed: true, exitCode: 0, output: "", report: "- verify: PASSED (exit=0)" }
        : { passed: false, exitCode: 2, output: "expected 200", report: "- verify: FAILED (exit=2)" };
    }),
  },
});

mock.module("./solve-repair.js", {
  namedExports: {
    repairLineage: mock.fn(async (plan: SolvePlan) => {
      repairs.push(plan.index);
    }),
  },
});

const plan: SolvePlan = { index: 2, label: "performant", prompt: "make it fast" };

function openSession(proxyReady = true): SolveSession {
  return {
    spec: { goal: "fix", verify_cmd: "npm test", cwd: "/repo" },
    rootBranch: "master",
    proxyReady,
    budgetExhausted: false,
  };
}

describe("runAttempt", () => {
  let runAttempt: (plan: SolvePlan, session: SolveSession) => Promise<AttemptResult>;
  let CHECKPOINT_NAME: string;

  before(async () => {
    const mod = await import("./solve-attempt.js");
    runAttempt = mod.runAttempt;
    CHECKPOINT_NAME = mod.CHECKPOINT_NAME;
  });

  function reset() {
    spawnedBranches.length = 0;
    workerCalls.length = 0;
    commits.length = 0;
    ranges.length = 0;
    repairs.length = 0;
    deltaArgs.length = 0;
    spawnThrows = false;
    checkoutOk = true;
    verifyPasses = true;
    verifyThrows = false;
    proxyCostCalls = 0;
    tokenDelta = 777;
    worker = { output: "did the work", exitCode: 0, durationMs: 5, timedOut: false };
  }

  it("branches every attempt from the solve restore point", async () => {
    reset();
    await runAttempt(plan, openSession());
    assert.equal(CHECKPOINT_NAME, "solve");
    assert.deepEqual(spawnedBranches, ["solve-strategy-2"]);
  });

  it("records a branch it could not create as a run that never started", async () => {
    reset();
    spawnThrows = true;
    const state = await runAttempt(plan, openSession());
    assert.equal(state.diagnostic.claude_exit_code, -1);
    assert.equal(state.diagnostic.claude_no_output, true);
    assert.equal(state.diagnostic.final_status, "failed");
    assert.deepEqual(workerCalls, []);
  });

  it("records a branch it could not check out the same way", async () => {
    reset();
    checkoutOk = false;
    const state = await runAttempt(plan, openSession());
    assert.equal(state.diagnostic.final_status, "failed");
    assert.equal(state.diagnostic.claude_exit_code, -1);
    assert.deepEqual(workerCalls, []);
  });

  it("gives the worker the plan prompt and the first-try time limit", async () => {
    reset();
    await runAttempt(plan, openSession());
    assert.deepEqual(workerCalls, [{ prompt: "make it fast", timeoutMs: 300_000 }]);
  });

  it("stops at a worker timeout, before any verification", async () => {
    reset();
    worker = { output: "partial", exitCode: 124, durationMs: 5, timedOut: true };
    const state = await runAttempt(plan, openSession());
    assert.equal(state.diagnostic.timed_out, true);
    assert.equal(state.diagnostic.final_status, "timed_out");
    assert.equal(state.diagnostic.claude_exit_code, 124);
    assert.deepEqual(commits, []);
  });

  it("stops when the worker produced only whitespace", async () => {
    reset();
    worker = { output: "  \n \t ", exitCode: 0, durationMs: 5, timedOut: false };
    const state = await runAttempt(plan, openSession());
    assert.equal(state.diagnostic.final_status, "no_output");
    assert.equal(state.diagnostic.claude_no_output, true);
    assert.deepEqual(commits, []);
  });

  it("cuts the worker output sample at 500 characters", async () => {
    reset();
    worker = { output: `${"w".repeat(500)}TAIL`, exitCode: 0, durationMs: 5, timedOut: false };
    const state = await runAttempt(plan, openSession());
    assert.equal(state.diagnostic.claude_output_sample, "w".repeat(500));
  });

  it("commits the work and diffs it against the branch the run started on", async () => {
    reset();
    const state = await runAttempt(plan, openSession());
    assert.deepEqual(commits, ["solve strategy 2"]);
    assert.deepEqual(ranges, ["master...solve-strategy-2"]);
    assert.equal(state.diff, "the diff");
  });

  it("passes an attempt whose verification passed, without repairing it", async () => {
    reset();
    const state = await runAttempt(plan, openSession());
    assert.equal(state.passed, true);
    assert.equal(state.exitCode, 0);
    assert.equal(state.report, "- verify: PASSED (exit=0)");
    assert.equal(state.diagnostic.final_status, "passed");
    assert.deepEqual(repairs, []);
  });

  it("repairs an attempt whose verification failed", async () => {
    reset();
    verifyPasses = false;
    const state = await runAttempt(plan, openSession());
    assert.equal(state.passed, false);
    assert.equal(state.exitCode, 2);
    assert.equal(state.output, "expected 200");
    assert.deepEqual(repairs, [2]);
  });

  it("measures the token spend against a snapshot taken before the work", async () => {
    reset();
    const state = await runAttempt(plan, openSession(true));
    assert.equal(proxyCostCalls, 1);
    assert.deepEqual(deltaArgs, [{ total: 100 }]);
    assert.equal(state.diagnostic.lineage_tokens, 777);
  });

  it("skips the snapshot when the proxy is down", async () => {
    reset();
    const state = await runAttempt(plan, openSession(false));
    assert.equal(proxyCostCalls, 0);
    assert.deepEqual(deltaArgs, [null]);
    assert.equal(state.diagnostic.lineage_tokens, 777);
  });

  it("turns a crash into an empty attempt that still reports its spend", async () => {
    reset();
    verifyThrows = true;
    const state = await runAttempt(plan, openSession());
    assert.equal(state.diagnostic.final_status, "no_output");
    assert.equal(state.diagnostic.claude_no_output, true);
    assert.equal(state.diagnostic.lineage_tokens, 777);
    assert.equal(state.branch, "solve-strategy-2");
  });

  it("tells the caller how the attempt ended", async () => {
    reset();
    const messages: string[] = [];
    const session = { ...openSession(), onProgress: (m: string) => messages.push(m) };
    await runAttempt(plan, session);
    assert.equal(messages.includes("  [3] PASSED"), true);
    assert.equal(messages.at(-1), "  [3] completed: passed");
  });
});
