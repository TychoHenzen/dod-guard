import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { blankResult } from "./attempt-result.js";
import type { SolvePlan } from "./solve-plan.js";
import type { SolveSession } from "./solve-session.js";

/** Branches handed to the abandon path, in order. */
const discarded: string[] = [];
/** Plan index of every attempt the loop started, in order. */
const started: number[] = [];
let attemptPasses = false;

mock.module("./solve-abandon.js", {
  namedExports: {
    discardAttempt: mock.fn(async (attempt: any) => {
      discarded.push(attempt.branch);
    }),
  },
});

mock.module("./solve-attempt.js", {
  namedExports: {
    CHECKPOINT_NAME: "solve",
    runAttempt: mock.fn(async (plan: SolvePlan) => {
      started.push(plan.index);
      const state = blankResult(plan);
      state.diagnostic.final_status = attemptPasses ? "passed" : "failed";
      state.diagnostic.lineage_tokens = 900;
      state.passed = attemptPasses;
      state.output = "boom";
      state.exitCode = attemptPasses ? 0 : 1;
      return state;
    }),
  },
});

const plans: SolvePlan[] = [0, 1, 2].map((index) => ({
  index,
  label: `strategy-${index}`,
  prompt: "go",
}));

describe("runAttempts", () => {
  let runAttempts: any;
  let createRun: any;

  before(async () => {
    runAttempts = (await import("./solve-loop.js")).runAttempts;
    createRun = (await import("./solve-run.js")).createRun;
  });

  function openSession(budgetTokens?: number): SolveSession {
    const spec = {
      goal: "fix",
      verify_cmd: "test",
      cwd: process.cwd(),
      budget_tokens: budgetTokens,
    };
    return {
      spec,
      rootBranch: "master",
      proxyReady: true,
      budgetExhausted: false,
    } as SolveSession;
  }

  function reset() {
    discarded.length = 0;
    started.length = 0;
    attemptPasses = false;
  }

  it("gives every plan a first try even after the budget is gone", async () => {
    reset();
    const session = openSession(1000);
    const run = createRun(session.spec);

    await runAttempts(plans, session, run);

    assert.deepEqual(started, [0, 1, 2]);
    assert.equal(session.budgetExhausted, true);
  });

  it("abandons the branch of every attempt that does not survive", async () => {
    reset();
    const session = openSession();
    const run = createRun(session.spec);

    await runAttempts(plans, session, run);

    assert.deepEqual(discarded, ["solve-strategy-0", "solve-strategy-1", "solve-strategy-2"]);
    assert.equal(run.survivors.length, 0);
  });

  it("keeps the branch of a surviving attempt", async () => {
    reset();
    attemptPasses = true;
    const session = openSession();
    const run = createRun(session.spec);

    await runAttempts(plans, session, run);

    assert.deepEqual(discarded, []);
    assert.equal(run.survivors.length, 3);
  });
});
