import * as assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import type { SolveRun } from "./solve-run.js";
import type { TaskSpec } from "./types.js";

/** Refusal the screen returns, or null to accept the candidate. */
let refusal: string | null = null;
/** Every candidate the screen saw, in order. */
const screened: string[] = [];

mock.module("./solve-screen.js", {
  namedExports: {
    screenCandidate: mock.fn((attempt: AttemptResult) => {
      screened.push(attempt.branch);
      return refusal;
    }),
  },
});

const spec: TaskSpec = { goal: "fix", verify_cmd: "npm test", cwd: "/repo", budget_tokens: 1000 };

function attempt(tokens: number | undefined, passed = false): AttemptResult {
  const state = blankResult({ index: 0, label: "simplest", prompt: "go" });
  state.passed = passed;
  state.exitCode = passed ? 0 : 1;
  state.diagnostic.lineage_tokens = tokens;
  state.diagnostic.final_status = passed ? "passed" : "failed";
  return state;
}

describe("solve-ledger", () => {
  let recordCost: (run: SolveRun, attempt: AttemptResult, elapsedMs: number) => void;
  let screenAttempt: (run: SolveRun, attempt: AttemptResult, spec: TaskSpec) => boolean;
  let emitBudgetWarnings: (run: SolveRun, onProgress?: (msg: string) => void) => void;
  let createRun: (spec: TaskSpec) => SolveRun;

  before(async () => {
    const mod = await import("./solve-ledger.js");
    recordCost = mod.recordCost;
    screenAttempt = mod.screenAttempt;
    emitBudgetWarnings = mod.emitBudgetWarnings;
    createRun = (await import("./solve-run.js")).createRun;
  });

  function reset() {
    refusal = null;
    screened.length = 0;
  }

  describe("recordCost", () => {
    it("replaces the unmeasured sentinel with the first real spend", () => {
      const run = createRun(spec);
      recordCost(run, attempt(900), 5);
      assert.equal(run.stats.tokens_consumed, 900);
    });

    it("adds each further spend to the running total", () => {
      const run = createRun(spec);
      recordCost(run, attempt(900), 5);
      recordCost(run, attempt(100), 5);
      assert.equal(run.stats.tokens_consumed, 1000);
    });

    it("keeps the sentinel when the attempt was never measured", () => {
      const run = createRun(spec);
      recordCost(run, attempt(undefined), 5);
      assert.equal(run.stats.tokens_consumed, -1);
    });

    it("keeps the sentinel when the proxy reported no spend", () => {
      const run = createRun(spec);
      recordCost(run, attempt(0), 5);
      assert.equal(run.stats.tokens_consumed, -1);
    });

    it("does not let an unmeasured attempt erase a measured one", () => {
      const run = createRun(spec);
      recordCost(run, attempt(900), 5);
      recordCost(run, attempt(undefined), 5);
      assert.equal(run.stats.tokens_consumed, 900);
    });

    it("charges the budget the measured spend and the elapsed time", () => {
      const run = createRun(spec);
      recordCost(run, attempt(900), 40);
      assert.equal(run.budget.consumption.implement.tokensUsed, 900);
      assert.equal(run.budget.consumption.implement.timeUsedMs, 40);
      assert.equal(run.budget.consumption.implement.attempts, 1);
    });

    it("charges the budget nothing for an unmeasured attempt, but counts the try", () => {
      const run = createRun(spec);
      recordCost(run, attempt(undefined), 40);
      assert.equal(run.budget.consumption.implement.tokensUsed, 0);
      assert.equal(run.budget.consumption.implement.attempts, 1);
    });

    it("marks the budget exhausted once the limit is passed", () => {
      const run = createRun(spec);
      recordCost(run, attempt(900), 5);
      assert.equal(run.budget.exhausted, false);
      recordCost(run, attempt(200), 5);
      assert.equal(run.budget.exhausted, true);
    });
  });

  describe("screenAttempt", () => {
    it("refuses an attempt that never passed, without screening it", () => {
      reset();
      const run = createRun(spec);
      assert.equal(screenAttempt(run, attempt(900, false), spec), false);
      assert.deepEqual(screened, []);
      assert.deepEqual(run.survivors, []);
      assert.deepEqual(run.rejections, []);
    });

    it("files a passing acceptable attempt as a survivor", () => {
      reset();
      const run = createRun(spec);
      const state = attempt(900, true);
      assert.equal(screenAttempt(run, state, spec), true);
      assert.deepEqual(screened, ["solve-strategy-0"]);
      assert.deepEqual(run.survivors, [state]);
      assert.deepEqual(run.rejections, []);
      assert.equal(state.diagnostic.final_status, "passed");
    });

    it("files a refused attempt as a rejection and drops its passing status", () => {
      reset();
      refusal = "strategy-0 rejected as degenerate: gutted the tests";
      const run = createRun(spec);
      const state = attempt(900, true);
      assert.equal(screenAttempt(run, state, spec), false);
      assert.deepEqual(run.survivors, []);
      assert.deepEqual(run.rejections, ["strategy-0 rejected as degenerate: gutted the tests"]);
      assert.equal(state.diagnostic.final_status, "failed");
    });
  });

  describe("emitBudgetWarnings", () => {
    const warning = { stage: "implement", fraction: 0.8, threshold: "80", resource: "tokens" };

    it("reports a threshold once", () => {
      const run = createRun(spec);
      run.budget.warnings = [warning] as never;
      const messages: string[] = [];
      emitBudgetWarnings(run, (m) => messages.push(m));
      emitBudgetWarnings(run, (m) => messages.push(m));
      assert.deepEqual(messages, ["  Budget: implement at 80% (tokens)"]);
    });

    it("reports each threshold of the same stage separately", () => {
      const run = createRun(spec);
      const later = { ...warning, fraction: 0.95, threshold: "95" };
      run.budget.warnings = [warning, later] as never;
      const messages: string[] = [];
      emitBudgetWarnings(run, (m) => messages.push(m));
      const at80 = "  Budget: implement at 80% (tokens)";
      const at95 = "  Budget: implement at 95% (tokens)";
      assert.deepEqual(messages, [at80, at95]);
    });

    it("reports the same threshold of another stage separately", () => {
      const run = createRun(spec);
      run.budget.warnings = [warning, { ...warning, stage: "total" }] as never;
      const messages: string[] = [];
      emitBudgetWarnings(run, (m) => messages.push(m));
      assert.equal(messages.length, 2);
      assert.equal(messages[1], "  Budget: total at 80% (tokens)");
    });

    it("does nothing when the caller offered no progress sink", () => {
      const run = createRun(spec);
      run.budget.warnings = [warning] as never;
      assert.doesNotThrow(() => emitBudgetWarnings(run));
      assert.equal(run.warned.has("implement:80"), true);
    });
  });
});
