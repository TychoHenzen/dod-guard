import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import { canContinue, readSignals } from "./solve-signals.js";

function state(): AttemptResult {
  const fresh = blankResult({ index: 0, label: "simplest", prompt: "go" });
  fresh.exitCode = 1;
  return fresh;
}

describe("readSignals", () => {
  it("reports no signal for a history that is too short to have a shape", () => {
    const attempt = state();
    const signals = readSignals(attempt, ["a"]);
    assert.deepEqual(signals, {
      stuck: false,
      oscillating: false,
      noProgress: false,
      budgetExhausted: false,
      timeExhausted: false,
    });
    assert.equal(attempt.diagnostic.failure_mode, "unknown");
  });

  it("reports no signal for an empty history", () => {
    const attempt = state();
    readSignals(attempt, []);
    assert.equal(attempt.diagnostic.failure_mode, "unknown");
    assert.deepEqual(attempt.diagnostic.signature_history?.signatures, []);
  });

  it("calls three identical failures stuck", () => {
    const attempt = state();
    const signals = readSignals(attempt, ["a", "a", "a"]);
    assert.equal(signals.stuck, true);
    assert.equal(signals.oscillating, false);
    assert.equal(signals.noProgress, false);
    assert.equal(attempt.diagnostic.failure_mode, "stuck");
  });

  it("does not call two identical failures stuck", () => {
    const attempt = state();
    assert.equal(readSignals(attempt, ["a", "a"]).stuck, false);
    assert.equal(attempt.diagnostic.failure_mode, "unknown");
  });

  it("calls an A to B to A history oscillating", () => {
    const attempt = state();
    const signals = readSignals(attempt, ["a", "b", "a"]);
    assert.equal(signals.oscillating, true);
    assert.equal(signals.stuck, false);
    assert.equal(attempt.diagnostic.failure_mode, "oscillating");
  });

  it("calls three different failures no progress", () => {
    const attempt = state();
    const signals = readSignals(attempt, ["a", "b", "c"]);
    assert.equal(signals.noProgress, true);
    assert.equal(signals.stuck, false);
    assert.equal(signals.oscillating, false);
    assert.equal(attempt.diagnostic.failure_mode, "noProgress");
  });

  it("reads the shape from the last three failures only", () => {
    const attempt = state();
    const signals = readSignals(attempt, ["b", "a", "a", "a"]);
    assert.equal(signals.stuck, true);
    assert.equal(attempt.diagnostic.failure_mode, "stuck");
  });

  it("never claims the budget or the clock ran out, because it cannot know", () => {
    const signals = readSignals(state(), ["a", "a", "a"]);
    assert.equal(signals.budgetExhausted, false);
    assert.equal(signals.timeExhausted, false);
  });

  it("records the signals next to the history it read them from", () => {
    const attempt = state();
    readSignals(attempt, ["a", "b", "a"]);
    assert.deepEqual(attempt.diagnostic.signature_history, {
      signatures: ["a", "b", "a"],
      stuck: false,
      oscillating: true,
      noProgress: false,
    });
  });

  it("keeps a copy of the history, so later tries do not rewrite the record", () => {
    const attempt = state();
    const history = ["a", "b"];
    readSignals(attempt, history);
    history.push("c");
    assert.deepEqual(attempt.diagnostic.signature_history?.signatures, ["a", "b"]);
  });
});

type Rung = "retry" | "resample" | "re-decompose" | "stronger-model" | "human";

function decision(action: "continue" | "escalate" | "abort", rung: Rung) {
  return {
    action,
    reason: "test",
    state: { currentRung: rung, attemptsAtRung: 0, totalAttempts: 0, history: [] },
  };
}

describe("canContinue", () => {
  it("stops on an abort, whatever rung the ladder is on", () => {
    assert.equal(canContinue(decision("abort", "retry")), false);
    assert.equal(canContinue(decision("abort", "resample")), false);
  });

  it("goes on while the ladder is still on the retry rung", () => {
    assert.equal(canContinue(decision("continue", "retry")), true);
  });

  it("goes on after an escalation to the resample rung", () => {
    assert.equal(canContinue(decision("escalate", "resample")), true);
  });

  it("stops once the ladder leaves the retry and resample rungs", () => {
    assert.equal(canContinue(decision("escalate", "re-decompose")), false);
    assert.equal(canContinue(decision("escalate", "stronger-model")), false);
    assert.equal(canContinue(decision("continue", "human")), false);
  });
});
