import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyVerification, blankResult, markNoOutput, markSpawnFailed } from "./attempt-result.js";
import type { SolvePlan } from "./solve-plan.js";
import type { VerifyOutcome } from "./solve-verify.js";

const plan: SolvePlan = { index: 2, label: "robust", prompt: "go" };

describe("blankResult", () => {
  it("names the lineage and the branch after the plan index", () => {
    const state = blankResult(plan);
    assert.equal(state.diagnostic.lineage_id, "strategy-2");
    assert.equal(state.branch, "solve-strategy-2");
  });

  it("carries the plan label as the strategy", () => {
    assert.equal(blankResult(plan).diagnostic.strategy, "robust");
  });

  it("starts as an unverified failure", () => {
    const state = blankResult(plan);
    assert.equal(state.passed, false);
    assert.equal(state.exitCode, -1);
    assert.equal(state.diff, "");
    assert.equal(state.report, "");
    assert.equal(state.output, "");
    assert.equal(state.diagnostic.final_status, "failed");
    assert.equal(state.diagnostic.repair_attempts, 0);
    assert.equal(state.diagnostic.timed_out, false);
    assert.equal(state.diagnostic.claude_exit_code, 0);
    assert.equal(state.diagnostic.claude_no_output, false);
  });

  it("leaves the verify fields unset until a verification runs", () => {
    const state = blankResult(plan);
    assert.equal(state.diagnostic.verify_failed, undefined);
    assert.equal(state.diagnostic.verify_exit_code, undefined);
    assert.equal(state.diagnostic.verify_output_sample, undefined);
  });

  it("gives each call its own state", () => {
    const first = blankResult(plan);
    const second = blankResult(plan);
    first.diagnostic.repair_attempts = 7;
    assert.equal(second.diagnostic.repair_attempts, 0);
  });
});

describe("markSpawnFailed", () => {
  it("records the did-not-run exit code and keeps the status a plain failure", () => {
    const state = markSpawnFailed(blankResult(plan));
    assert.equal(state.diagnostic.claude_exit_code, -1);
    assert.equal(state.diagnostic.claude_no_output, true);
    assert.equal(state.diagnostic.final_status, "failed");
  });

  it("returns the same state object it was given", () => {
    const state = blankResult(plan);
    assert.equal(markSpawnFailed(state), state);
  });
});

describe("markNoOutput", () => {
  it("records an empty run without touching the worker exit code", () => {
    const state = blankResult(plan);
    state.diagnostic.claude_exit_code = 0;
    markNoOutput(state);
    assert.equal(state.diagnostic.claude_no_output, true);
    assert.equal(state.diagnostic.final_status, "no_output");
    assert.equal(state.diagnostic.claude_exit_code, 0);
  });
});

describe("applyVerification", () => {
  function outcome(over: Partial<VerifyOutcome> = {}): VerifyOutcome {
    return { passed: false, exitCode: 1, output: "boom", report: "- verify: FAILED", ...over };
  }

  it("copies the outcome onto the attempt", () => {
    const state = blankResult(plan);
    applyVerification(state, outcome());
    assert.equal(state.passed, false);
    assert.equal(state.exitCode, 1);
    assert.equal(state.output, "boom");
    assert.equal(state.report, "- verify: FAILED");
  });

  it("records a passing verification as not failed", () => {
    const state = blankResult(plan);
    applyVerification(state, outcome({ passed: true, exitCode: 0, output: "" }));
    assert.equal(state.passed, true);
    assert.equal(state.diagnostic.verify_failed, false);
    assert.equal(state.diagnostic.verify_exit_code, 0);
    assert.equal(state.diagnostic.verify_output_sample, "");
  });

  it("records a failing verification as failed", () => {
    const state = blankResult(plan);
    applyVerification(state, outcome({ exitCode: 3 }));
    assert.equal(state.diagnostic.verify_failed, true);
    assert.equal(state.diagnostic.verify_exit_code, 3);
    assert.equal(state.diagnostic.verify_output_sample, "boom");
  });

  it("keeps a 300-character sample whole", () => {
    const state = blankResult(plan);
    applyVerification(state, outcome({ output: "x".repeat(300) }));
    assert.equal(state.diagnostic.verify_output_sample?.length, 300);
  });

  it("cuts a longer sample at 300 characters but keeps the full output", () => {
    const state = blankResult(plan);
    const long = `${"x".repeat(300)}TAIL`;
    applyVerification(state, outcome({ output: long }));
    assert.equal(state.diagnostic.verify_output_sample, "x".repeat(300));
    assert.equal(state.output.length, 304);
  });

  it("leaves the run status alone, because the caller owns it", () => {
    const state = blankResult(plan);
    state.diagnostic.final_status = "timed_out";
    applyVerification(state, outcome({ passed: true, exitCode: 0 }));
    assert.equal(state.diagnostic.final_status, "timed_out");
  });
});
