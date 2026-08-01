import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import type { SolvePlan } from "./solve-plan.js";
import type { SolveSession } from "./solve-session.js";

/** Failure shape the ladder mock reports. The values are never read. */
const CALM = { stuck: false, oscillating: false, noProgress: false };

/** Verdicts the ladder hands back, oldest first. Empty means stop. */
let ladderAllows: boolean[] = [];
/** Histories readSignals saw, in order. */
const seenHistories: string[][] = [];

/** Prompts and timeouts handed to the worker, in order. */
const workerCalls: { prompt: string; timeoutMs: number }[] = [];
let worker = { output: "tried again", exitCode: 0, durationMs: 5, timedOut: false };

/** Commit messages, in order. */
const commits: string[] = [];
/** Diff ranges, in order. */
const ranges: string[] = [];

/** Verification verdicts, oldest first. The last one repeats. */
let verifyVerdicts: boolean[] = [false];
let verifyCalls = 0;

mock.module("./solve-signals.js", {
  namedExports: {
    readSignals: mock.fn((_state: AttemptResult, history: string[]) => {
      seenHistories.push([...history]);
      return { ...CALM, budgetExhausted: false, timeExhausted: false };
    }),
    canContinue: mock.fn(() => ladderAllows.shift() ?? false),
  },
});

mock.module("./feedback.js", {
  namedExports: {
    compileFeedback: mock.fn(() => []),
  },
});

mock.module("./solve-worker.js", {
  namedExports: {
    REPAIR_TIMEOUT_MS: 180_000,
    spawnWorker: mock.fn(async (prompt: string, _session: SolveSession, timeoutMs: number) => {
      workerCalls.push({ prompt, timeoutMs });
      return worker;
    }),
  },
});

mock.module("./solve-git.js", {
  namedExports: {
    commitCandidate: mock.fn((_cwd: string, message: string) => {
      commits.push(message);
    }),
    captureDiff: mock.fn((_cwd: string, range: string) => {
      ranges.push(range);
      return "the repaired diff";
    }),
  },
});

mock.module("./solve-verify.js", {
  namedExports: {
    runVerification: mock.fn(async () => {
      const passed = verifyVerdicts[Math.min(verifyCalls, verifyVerdicts.length - 1)];
      verifyCalls++;
      return passed
        ? { passed: true, exitCode: 0, output: "", report: "- verify: PASSED (exit=0)" }
        : { passed: false, exitCode: 2, output: `still failing ${verifyCalls}`, report: "- verify: FAILED" };
    }),
  },
});

const plan: SolvePlan = { index: 0, label: "simplest", prompt: "go" };

function failedState(): AttemptResult {
  const state = blankResult(plan);
  state.output = "expected 200, got 401";
  state.exitCode = 2;
  return state;
}

function openSession(budgetExhausted = false): SolveSession {
  return {
    spec: { goal: "fix the login test", verify_cmd: "npm test", cwd: "/repo" },
    rootBranch: "master",
    proxyReady: true,
    budgetExhausted,
  };
}

describe("repairLineage", () => {
  let repairLineage: (plan: SolvePlan, session: SolveSession, state: AttemptResult) => Promise<void>;

  before(async () => {
    repairLineage = (await import("./solve-repair.js")).repairLineage;
  });

  function reset() {
    ladderAllows = [];
    seenHistories.length = 0;
    workerCalls.length = 0;
    commits.length = 0;
    ranges.length = 0;
    verifyVerdicts = [false];
    verifyCalls = 0;
    worker = { output: "tried again", exitCode: 0, durationMs: 5, timedOut: false };
  }

  it("tries nothing once the run budget is gone", async () => {
    reset();
    const state = failedState();
    await repairLineage(plan, openSession(true), state);
    assert.deepEqual(workerCalls, []);
    assert.equal(state.diagnostic.repair_attempts, 0);
    assert.equal(state.diagnostic.final_status, "failed");
  });

  it("calls the lineage stuck when the ladder offers no further try", async () => {
    reset();
    ladderAllows = [false];
    const state = failedState();
    await repairLineage(plan, openSession(), state);
    assert.equal(state.diagnostic.final_status, "stuck");
    assert.equal(state.diagnostic.repair_attempts, 0);
    assert.deepEqual(workerCalls, []);
  });

  it("numbers the first repair one and gives it the repair time limit", async () => {
    reset();
    ladderAllows = [true];
    const state = failedState();
    await repairLineage(plan, openSession(), state);
    assert.equal(workerCalls.length, 1);
    assert.equal(workerCalls[0].timeoutMs, 180_000);
    const sent = workerCalls[0].prompt;
    assert.equal(sent.includes("This is repair attempt #1."), true);
    assert.equal(sent.includes("fix the login test"), true);
  });

  it("numbers each further repair in the prompt it sends", async () => {
    reset();
    ladderAllows = [true, true, false];
    await repairLineage(plan, openSession(), failedState());
    const sent = workerCalls[1].prompt;
    assert.equal(sent.includes("This is repair attempt #2."), true);
  });

  it("stops at a worker timeout, before any verification", async () => {
    reset();
    ladderAllows = [true, true];
    worker = { output: "", exitCode: 124, durationMs: 5, timedOut: true };
    const state = failedState();
    await repairLineage(plan, openSession(), state);
    assert.equal(state.diagnostic.timed_out, true);
    assert.equal(state.diagnostic.final_status, "timed_out");
    assert.equal(state.diagnostic.repair_attempts, 1);
    assert.equal(verifyCalls, 0);
    assert.deepEqual(commits, []);
  });

  it("stops at the first repair that verifies", async () => {
    reset();
    ladderAllows = [true, true, true];
    verifyVerdicts = [true];
    const state = failedState();
    await repairLineage(plan, openSession(), state);
    assert.equal(state.diagnostic.final_status, "passed");
    assert.equal(state.diagnostic.repair_attempts, 1);
    assert.equal(state.passed, true);
    assert.equal(workerCalls.length, 1);
  });

  it("commits and diffs each repair round", async () => {
    reset();
    ladderAllows = [true, true, false];
    const state = failedState();
    await repairLineage(plan, openSession(), state);
    assert.deepEqual(commits, ["solve strategy 0 repair 1", "solve strategy 0 repair 2"]);
    assert.deepEqual(ranges, ["master...solve-strategy-0", "master...solve-strategy-0"]);
    assert.equal(state.diff, "the repaired diff");
  });

  it("gives up as stuck once the ladder stops offering tries", async () => {
    reset();
    ladderAllows = [true, true, false];
    const state = failedState();
    await repairLineage(plan, openSession(), state);
    assert.equal(state.diagnostic.repair_attempts, 2);
    assert.equal(state.diagnostic.final_status, "stuck");
  });

  it("folds each new verification onto the attempt", async () => {
    reset();
    ladderAllows = [true, false];
    const state = failedState();
    await repairLineage(plan, openSession(), state);
    assert.equal(state.output, "still failing 1");
    assert.equal(state.exitCode, 2);
    assert.equal(state.diagnostic.verify_failed, true);
  });

  it("grows the failure history by one signature per try", async () => {
    reset();
    ladderAllows = [true, true, false];
    await repairLineage(plan, openSession(), failedState());
    assert.deepEqual(
      seenHistories.map((h) => h.length),
      [1, 2, 3],
    );
  });

  it("reports each repair round to the caller", async () => {
    reset();
    ladderAllows = [true, false];
    const messages: string[] = [];
    const session = { ...openSession(), onProgress: (m: string) => messages.push(m) };
    await repairLineage(plan, session, failedState());
    assert.deepEqual(messages, ["  [1] repair 1: 0 diag"]);
  });
});
