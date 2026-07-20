import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BudgetStage } from "./budget.js";
import {
  budgetSummary,
  createBudgetState,
  fractionConsumed,
  isStageExhausted,
  recordAttempt,
  recordTime,
  recordTokens,
  recordVerifiedEdge,
  totalCost,
} from "./budget.js";

// ── createBudgetState ──────────────────────────────────────────────────

describe("createBudgetState", () => {
  it("all stages initialized, total exhausted = false", () => {
    const state = createBudgetState();

    // All stages exist
    const stages: BudgetStage[] = ["spec", "test_author", "implement", "harden", "review", "merge", "total"];
    for (const s of stages) {
      assert.ok(state.stages[s], `${s} stage exists`);
      assert.ok(state.consumption[s], `${s} consumption exists`);
      assert.equal(state.consumption[s].tokensUsed, 0);
      assert.equal(state.consumption[s].timeUsedMs, 0);
      assert.equal(state.consumption[s].attempts, 0);
      assert.equal(state.consumption[s].verifiedEdges, 0);
    }

    assert.equal(state.exhausted, false);
    assert.equal(state.costPerVerifiedEdge, null);
    assert.deepStrictEqual(state.warnings, []);
  });

  it("overrides work for specific stages", () => {
    const state = createBudgetState({
      implement: { tokenLimit: 999_999 },
      spec: { timeLimitMs: 100_000 },
    });

    assert.equal(state.stages.implement.tokenLimit, 999_999);
    assert.equal(state.stages.spec.timeLimitMs, 100_000);

    // Other stages keep defaults
    assert.equal(state.stages.merge.tokenLimit, 10_000);
    assert.equal(state.stages.total.tokenLimit, 500_000);
  });
});

// ── recordTokens ───────────────────────────────────────────────────────

describe("recordTokens", () => {
  it("increments stage + total, generates warnings at 50/80/95/100%", () => {
    let state = createBudgetState();
    // spec tokenLimit = 20,000

    // 50% threshold: 10,000 tokens
    state = recordTokens(state, "spec", 10_000);
    assert.equal(state.consumption.spec.tokensUsed, 10_000);
    assert.equal(state.consumption.total.tokensUsed, 10_000);
    assert.equal(state.warnings.length, 1);
    assert.equal(state.warnings[0].stage, "spec");
    assert.equal(state.warnings[0].threshold, "50");
    assert.equal(state.warnings[0].resource, "tokens");

    // 80% threshold: 16,000 total (add 6,000)
    state = recordTokens(state, "spec", 6_000);
    assert.equal(state.warnings.length, 2);
    assert.equal(state.warnings[1].threshold, "80");

    // 95% threshold: 19,000 total (add 3,000)
    state = recordTokens(state, "spec", 3_000);
    assert.equal(state.warnings.length, 3);
    assert.equal(state.warnings[2].threshold, "95");

    // 100% threshold: 20,000 total (add 1,000)
    state = recordTokens(state, "spec", 1_000);
    assert.equal(state.warnings.length, 4);
    assert.equal(state.warnings[3].threshold, "100");

    // Stage is now exhausted
    assert.ok(isStageExhausted(state, "spec"));
  });

  it("total is accurate across multiple stages", () => {
    let state = createBudgetState();

    state = recordTokens(state, "spec", 10_000);
    state = recordTokens(state, "implement", 50_000);
    state = recordTokens(state, "review", 5_000);

    assert.equal(state.consumption.spec.tokensUsed, 10_000);
    assert.equal(state.consumption.implement.tokensUsed, 50_000);
    assert.equal(state.consumption.review.tokensUsed, 5_000);
    assert.equal(state.consumption.total.tokensUsed, 65_000);
  });
});

// ── recordTime ─────────────────────────────────────────────────────────

describe("recordTime", () => {
  it("increments time, same warning thresholds", () => {
    let state = createBudgetState();
    // spec timeLimitMs = 300,000

    // 50% threshold: 150,000 ms
    state = recordTime(state, "spec", 150_000);
    assert.equal(state.consumption.spec.timeUsedMs, 150_000);
    assert.equal(state.consumption.total.timeUsedMs, 150_000);
    assert.equal(state.warnings.length, 1);
    assert.equal(state.warnings[0].threshold, "50");
    assert.equal(state.warnings[0].resource, "time");

    // 80% threshold: 240,000 total (add 90,000)
    state = recordTime(state, "spec", 90_000);
    assert.equal(state.warnings.length, 2);
    assert.equal(state.warnings[1].threshold, "80");

    // 95% threshold: 285,000 total (add 45,000)
    state = recordTime(state, "spec", 45_000);
    assert.equal(state.warnings.length, 3);
    assert.equal(state.warnings[2].threshold, "95");

    // 100% threshold: 300,000 total (add 15,000)
    state = recordTime(state, "spec", 15_000);
    assert.equal(state.warnings.length, 4);
    assert.equal(state.warnings[3].threshold, "100");
  });

  it("total time accumulates across stages", () => {
    let state = createBudgetState();
    state = recordTime(state, "spec", 100_000);
    state = recordTime(state, "implement", 200_000);
    assert.equal(state.consumption.total.timeUsedMs, 300_000);
  });
});

// ── recordAttempt ──────────────────────────────────────────────────────

describe("recordAttempt", () => {
  it("increments tokens + time + attempts", () => {
    let state = createBudgetState();
    state = recordAttempt(state, "implement", 10_000, 30_000);

    assert.equal(state.consumption.implement.tokensUsed, 10_000);
    assert.equal(state.consumption.total.tokensUsed, 10_000);
    assert.equal(state.consumption.implement.timeUsedMs, 30_000);
    assert.equal(state.consumption.total.timeUsedMs, 30_000);
    assert.equal(state.consumption.implement.attempts, 1);
    assert.equal(state.consumption.total.attempts, 1);
  });

  it("multiple attempts accumulate", () => {
    let state = createBudgetState();
    state = recordAttempt(state, "implement", 5_000, 10_000);
    state = recordAttempt(state, "implement", 3_000, 8_000);

    assert.equal(state.consumption.implement.tokensUsed, 8_000);
    assert.equal(state.consumption.implement.timeUsedMs, 18_000);
    assert.equal(state.consumption.implement.attempts, 2);
    assert.equal(state.consumption.total.attempts, 2);
  });
});

// ── recordVerifiedEdge ─────────────────────────────────────────────────

describe("recordVerifiedEdge", () => {
  it("increments edge count, calculates costPerVerifiedEdge", () => {
    let state = createBudgetState();

    // Start with no edges
    assert.equal(state.costPerVerifiedEdge, null);

    // Record some tokens and one edge
    state = recordTokens(state, "implement", 100_000);
    state = recordVerifiedEdge(state, "implement", 1);

    assert.equal(state.consumption.implement.verifiedEdges, 1);
    assert.equal(state.consumption.total.verifiedEdges, 1);
    // totalCost = 100_000 * (0.00027 / 1000) = 100_000 * 0.00000027 = 0.027
    // costPerEdge = 0.027 / 1 = 0.027
    assert.ok(state.costPerVerifiedEdge !== null);
    assert.equal(state.costPerVerifiedEdge, (100_000 * (0.00027 / 1000)) / 1);

    // Add another edge — cost per edge drops
    state = recordVerifiedEdge(state, "harden", 2);
    assert.equal(state.consumption.total.verifiedEdges, 3);
    assert.equal(state.costPerVerifiedEdge, (100_000 * (0.00027 / 1000)) / 3);
  });
});

// ── isStageExhausted ───────────────────────────────────────────────────

describe("isStageExhausted", () => {
  it("true when tokens >= limit", () => {
    const state = createBudgetState({
      spec: { tokenLimit: 10_000 },
    });
    const s = recordTokens(state, "spec", 10_000);
    assert.ok(isStageExhausted(s, "spec"));
  });

  it("true when time >= limit", () => {
    const state = createBudgetState({
      spec: { timeLimitMs: 100_000 },
    });
    const s = recordTime(state, "spec", 100_000);
    assert.ok(isStageExhausted(s, "spec"));
  });

  it("false when well under limits", () => {
    const state = createBudgetState();
    const s = recordTokens(state, "spec", 100);
    assert.ok(!isStageExhausted(s, "spec"));
  });
});

// ── fractionConsumed ───────────────────────────────────────────────────

describe("fractionConsumed", () => {
  it("max of token fraction and time fraction", () => {
    const state = createBudgetState({
      spec: { tokenLimit: 100_000, timeLimitMs: 100_000 },
    });
    // tokens: 25% (25_000/100_000), time: 50% (50_000/100_000)
    const s = recordTokens(state, "spec", 25_000);
    const st = recordTime(s, "spec", 50_000);

    assert.equal(fractionConsumed(st, "spec"), 0.5);
  });

  it("token fraction wins when larger than time fraction", () => {
    const state = createBudgetState({
      spec: { tokenLimit: 100_000, timeLimitMs: 100_000 },
    });
    const s = recordTokens(state, "spec", 80_000);
    const st = recordTime(s, "spec", 20_000);

    assert.equal(fractionConsumed(st, "spec"), 0.8);
  });

  it("returns 0 for stage with no consumption and zero limits", () => {
    const state = createBudgetState();
    assert.equal(fractionConsumed(state, "spec"), 0);
  });
});

// ── totalCost ──────────────────────────────────────────────────────────

describe("totalCost", () => {
  it("based on token consumption × pricing", () => {
    let state = createBudgetState();
    state = recordTokens(state, "implement", 100_000);

    // 100_000 tokens * (0.00027 / 1000) = 0.027
    const expected = 100_000 * (0.00027 / 1000);
    assert.equal(totalCost(state), expected);
  });

  it("zero cost when no tokens consumed", () => {
    const state = createBudgetState();
    assert.equal(totalCost(state), 0);
  });

  it("accumulates across stages", () => {
    let state = createBudgetState();
    state = recordTokens(state, "spec", 50_000);
    state = recordTokens(state, "implement", 150_000);
    state = recordTokens(state, "review", 25_000);

    const expected = 225_000 * (0.00027 / 1000);
    assert.equal(totalCost(state), expected);
  });
});

// ── budgetSummary ──────────────────────────────────────────────────────

describe("budgetSummary", () => {
  it("returns non-empty string with token counts", () => {
    let state = createBudgetState();
    state = recordTokens(state, "spec", 10_000);
    state = recordTokens(state, "implement", 50_000);
    state = recordVerifiedEdge(state, "implement", 3);

    const summary = budgetSummary(state);

    assert.ok(typeof summary === "string");
    assert.ok(summary.length > 0, "non-empty summary");
    assert.ok(summary.includes("Budget Summary"), "has header");
    assert.ok(summary.includes("spec"), "spec stage present");
    assert.ok(summary.includes("implement"), "implement stage present");
    assert.ok(summary.match(/\d+.*tokens/), "token count present");
    assert.ok(summary.match(/\d+.*edges/), "edge count present");
  });

  it("includes cost per edge when available", () => {
    let state = createBudgetState();
    state = recordTokens(state, "implement", 100_000);
    state = recordVerifiedEdge(state, "implement", 1);

    const summary = budgetSummary(state);
    assert.ok(summary.includes("Cost per edge"), "cost per edge shown");
  });

  it("includes budget exhausted warning when exhausted", () => {
    // Override total budget lower so we can exhaust total without
    // exceeding any single stage's budget (consumptionBar clamps).
    let state = createBudgetState({
      total: { tokenLimit: 50_000, timeLimitMs: 3_600_000 },
    });
    state = recordTokens(state, "implement", 50_000);

    const summary = budgetSummary(state);
    assert.ok(summary.includes("BUDGET EXHAUSTED"), "exhaustion warning");
  });
});

// ── Budget exhaustion sets exhausted=true on total ─────────────────────

describe("budget exhaustion", () => {
  it("tokens exhaust total budget → exhausted=true", () => {
    let state = createBudgetState();
    state = recordTokens(state, "implement", 500_000);
    assert.equal(state.exhausted, true);
  });

  it("time exhausts total budget → exhausted=true", () => {
    let state = createBudgetState();
    state = recordTime(state, "implement", 3_600_000);
    assert.equal(state.exhausted, true);
  });

  it("partial consumption → exhausted=false", () => {
    let state = createBudgetState();
    state = recordTokens(state, "spec", 10_000);
    assert.equal(state.exhausted, false);
  });
});

// ── Multiple warnings for different stages ─────────────────────────────

describe("warnings across stages", () => {
  it("generates independent warnings per stage", () => {
    let state = createBudgetState();

    // Hit 50% on spec via tokens
    state = recordTokens(state, "spec", 10_000);
    assert.equal(state.warnings.length, 1);
    assert.equal(state.warnings[0].stage, "spec");

    // Hit 50% on implement via tokens (limit = 200_000)
    state = recordTokens(state, "implement", 100_000);
    assert.equal(state.warnings.length, 2);
    assert.equal(state.warnings[1].stage, "implement");

    // Hit 50% on harden via time (limit = 600_000)
    state = recordTime(state, "harden", 300_000);
    assert.equal(state.warnings.length, 3);
    assert.equal(state.warnings[2].stage, "harden");
  });

  it("does not duplicate warnings for the same stage+threshold", () => {
    let state = createBudgetState();

    // Hit 50% on spec twice (should only warn once)
    state = recordTokens(state, "spec", 10_000); // 50%
    assert.equal(state.warnings.length, 1);
    state = recordTokens(state, "spec", 0); // still 50%
    assert.equal(state.warnings.length, 1, "no duplicate 50% warning");

    // Hit 50% threshold again with time at the same stage
    // But timeFrac is 0, so tokenFrac is still what hits 50%
    // Already warned at 50%, no new warning
    state = recordTime(state, "spec", 1_000);
    assert.equal(state.warnings.length, 1, "no duplicate warning for same threshold at same stage");
  });
});
