import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STRATEGIES, STRATEGY_LABELS } from "./prompts.js";
import { buildPlans } from "./solve-plan.js";
import type { TaskSpec } from "./types.js";

const spec: TaskSpec = {
  goal: "make the login test pass",
  verify_cmd: "npm test",
  cwd: "/repo",
};

describe("buildPlans", () => {
  it("returns nothing when no approach was asked for", () => {
    assert.deepEqual(buildPlans(spec, 0), []);
  });

  it("returns the first approach for a fanout of one", () => {
    const plans = buildPlans(spec, 1);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].index, 0);
    assert.equal(plans[0].label, "simplest");
  });

  it("numbers the surviving plans from zero, with no gaps", () => {
    const plans = buildPlans(spec, 5);
    assert.deepEqual(
      plans.map((p) => p.index),
      plans.map((_, i) => i),
    );
  });

  it("gives each plan a prompt that states its own strategy", () => {
    for (const plan of buildPlans(spec, 8)) {
      const origin = STRATEGY_LABELS.indexOf(plan.label);
      assert.notEqual(origin, -1);
      assert.equal(plan.prompt.includes(STRATEGIES[origin]), true);
    }
  });

  it("never repeats an approach label", () => {
    const labels = buildPlans(spec, 8).map((p) => p.label);
    assert.equal(new Set(labels).size, labels.length);
  });

  it("carries the goal into every prompt", () => {
    for (const plan of buildPlans(spec, 5)) {
      assert.equal(plan.prompt.includes("make the login test pass"), true);
    }
  });

  it("carries the caller context into every prompt", () => {
    const withCtx = { ...spec, context: "the API moved to /v2" };
    for (const plan of buildPlans(withCtx, 3)) {
      assert.equal(plan.prompt.includes("the API moved to /v2"), true);
    }
  });

  it("drops the approaches that repeat once the list wraps", () => {
    const eight = buildPlans(spec, 8);
    const ten = buildPlans(spec, 10);
    assert.deepEqual(ten, eight);
  });

  it("never returns more plans than were sampled", () => {
    for (const count of [1, 2, 3, 5, 8, 13]) {
      assert.equal(buildPlans(spec, count).length <= count, true);
    }
  });

  it("grows the plan list as the fanout grows, up to the wrap point", () => {
    const three = buildPlans(spec, 3).length;
    const five = buildPlans(spec, 5).length;
    assert.equal(five >= three, true);
    assert.equal(three >= 1, true);
  });
});
