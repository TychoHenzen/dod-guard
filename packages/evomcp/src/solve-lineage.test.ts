import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import { openLineage, recordTry } from "./solve-lineage.js";
import type { SolvePlan } from "./solve-plan.js";
import type { SolveSession } from "./solve-session.js";

const plan: SolvePlan = { index: 0, label: "simplest", prompt: "do it" };

const session = {
  spec: { goal: "fix", verify_cmd: "test", cwd: process.cwd() },
  rootBranch: "master",
  proxyReady: false,
  budgetExhausted: false,
} as SolveSession;

function attemptWith(output: string): AttemptResult {
  const state = blankResult(plan);
  state.output = output;
  state.exitCode = 1;
  return state;
}

describe("lineage record", () => {
  it("opens with the first failure already filed", () => {
    const state = attemptWith("expected 1 to equal 2");
    const lineage = openLineage(plan, session, state);

    assert.equal(lineage.history.length, 1);
    assert.equal(lineage.summaries.length, 1);
    assert.equal(lineage.summaries[0].strategy, "simplest");
    assert.equal(lineage.summaries[0].outcome, "failed");
    assert.equal(lineage.summaries[0].summary, "expected 1 to equal 2");
  });

  it("carries one signature per try, oldest first", () => {
    const state = attemptWith("first failure");
    const lineage = openLineage(plan, session, state);

    state.output = "second failure";
    recordTry(lineage);

    assert.equal(lineage.history.length, 2);
    assert.notEqual(lineage.history[0], lineage.history[1]);
    assert.equal(lineage.summaries[1].summary, "second failure");
    assert.equal(lineage.summaries[1].failureSignature, lineage.history[1]);
  });

  it("repeats the signature when the failure does not change", () => {
    const state = attemptWith("same failure");
    const lineage = openLineage(plan, session, state);
    recordTry(lineage);

    assert.equal(lineage.history[0], lineage.history[1]);
  });
});
