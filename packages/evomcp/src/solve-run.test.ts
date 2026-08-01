import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRun, TOKENS_UNMEASURED } from "./solve-run.js";
import type { TaskSpec } from "./types.js";

const spec: TaskSpec = {
  goal: "make the login test pass",
  verify_cmd: "npm test",
  cwd: "/repo",
};

describe("TOKENS_UNMEASURED", () => {
  it("is the negative sentinel, so it can never be mistaken for a spend", () => {
    assert.equal(TOKENS_UNMEASURED, -1);
  });
});

describe("createRun", () => {
  it("opens an empty ledger", () => {
    const run = createRun(spec);
    assert.deepEqual(run.attempts, []);
    assert.deepEqual(run.survivors, []);
    assert.deepEqual(run.rejections, []);
    assert.equal(run.warned.size, 0);
  });

  it("starts the token count at the unmeasured sentinel, not at zero", () => {
    assert.equal(createRun(spec).stats.tokens_consumed, -1);
  });

  it("starts the other counters at zero", () => {
    const stats = createRun(spec).stats;
    assert.equal(stats.plans_sampled, 0);
    assert.equal(stats.plans_deduped, 0);
    assert.equal(stats.candidates_generated, 0);
    assert.equal(stats.duration_ms, 0);
  });

  it("uses the default model when the caller names none", () => {
    assert.equal(createRun(spec).stats.model, "deepseek-v4-pro[1m]");
  });

  it("uses the caller model when one is named", () => {
    assert.equal(createRun({ ...spec, model: "deepseek-chat" }).stats.model, "deepseek-chat");
  });

  it("applies the caller budget to both the implement stage and the total", () => {
    const run = createRun({ ...spec, budget_tokens: 42 });
    assert.equal(run.budget.stages.implement.tokenLimit, 42);
    assert.equal(run.budget.stages.total.tokenLimit, 42);
  });

  it("defaults the budget to 100000 tokens", () => {
    const run = createRun(spec);
    assert.equal(run.budget.stages.implement.tokenLimit, 100_000);
    assert.equal(run.budget.stages.total.tokenLimit, 100_000);
  });

  it("honours a zero budget instead of falling back to the default", () => {
    assert.equal(createRun({ ...spec, budget_tokens: 0 }).budget.stages.implement.tokenLimit, 0);
  });

  it("leaves the stages it does not use at their own defaults", () => {
    const run = createRun({ ...spec, budget_tokens: 42 });
    assert.equal(run.budget.stages.spec.tokenLimit, 20_000);
    assert.equal(run.budget.stages.review.tokenLimit, 30_000);
  });

  it("leaves the time limits of the touched stages alone", () => {
    const run = createRun({ ...spec, budget_tokens: 42 });
    assert.equal(run.budget.stages.implement.timeLimitMs, 1_800_000);
    assert.equal(run.budget.stages.total.timeLimitMs, 3_600_000);
  });

  it("opens the budget unspent", () => {
    const run = createRun(spec);
    assert.equal(run.budget.exhausted, false);
    assert.deepEqual(run.budget.warnings, []);
    assert.equal(run.budget.consumption.implement.tokensUsed, 0);
    assert.equal(run.budget.consumption.implement.attempts, 0);
  });

  it("stamps the start time no later than now", () => {
    const before = Date.now();
    const run = createRun(spec);
    assert.equal(run.startedAt >= before, true);
    assert.equal(run.startedAt <= Date.now(), true);
  });

  it("gives each run its own collections", () => {
    const first = createRun(spec);
    const second = createRun(spec);
    first.attempts.push({} as never);
    first.warned.add("implement:80");
    assert.equal(second.attempts.length, 0);
    assert.equal(second.warned.size, 0);
  });
});
