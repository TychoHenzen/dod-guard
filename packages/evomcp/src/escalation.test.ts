import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EscalationState, TriggerSignals } from "./escalation.js";
import {
  createEscalationState,
  evaluateEscalation,
  isStuck,
  recordFailure,
  recordSuccess,
  resetToRetry,
} from "./escalation.js";

// ── Helpers ────────────────────────────────────────────────────────────

function noSignals(): TriggerSignals {
  return {
    stuck: false,
    oscillating: false,
    noProgress: false,
    budgetExhausted: false,
    timeExhausted: false,
  };
}

function stateAtRung(rung: EscalationState["currentRung"], attempts: number): EscalationState {
  return {
    currentRung: rung,
    attemptsAtRung: attempts,
    totalAttempts: attempts,
    history: [],
  };
}

// ── createEscalationState ──────────────────────────────────────────────

describe("createEscalationState", () => {
  it("starts at 'retry' rung with 0 attempts and empty history", () => {
    const state = createEscalationState();
    assert.equal(state.currentRung, "retry");
    assert.equal(state.attemptsAtRung, 0);
    assert.equal(state.totalAttempts, 0);
    assert.deepStrictEqual(state.history, []);
  });
});

// ── evaluateEscalation ─────────────────────────────────────────────────

describe("evaluateEscalation", () => {
  it("no triggers, under max → 'continue'", () => {
    const state = createEscalationState();
    const decision = evaluateEscalation(state, noSignals());

    assert.equal(decision.action, "continue");
    assert.equal(decision.reason, "Continuing at current rung.");
    // State should be unchanged
    assert.equal(decision.state.currentRung, "retry");
    assert.equal(decision.state.attemptsAtRung, 0);
  });

  it("stuck=true → 'escalate' to 'resample'", () => {
    const state = createEscalationState();
    const decision = evaluateEscalation(state, { ...noSignals(), stuck: true });

    assert.equal(decision.action, "escalate");
    assert.equal(decision.nextRung, "resample");
    assert.ok(decision.reason.includes("stuck"));
    // State updated: rung advanced, attemptsAtRung reset
    assert.equal(decision.state.currentRung, "resample");
    assert.equal(decision.state.attemptsAtRung, 0);
    assert.equal(decision.state.history.length, 1);
  });

  it("oscillating=true → 'escalate' to 'resample'", () => {
    const state = createEscalationState();
    const decision = evaluateEscalation(state, { ...noSignals(), oscillating: true });

    assert.equal(decision.action, "escalate");
    assert.equal(decision.nextRung, "resample");
    assert.ok(decision.reason.includes("oscillating"));
  });

  it("noProgress=true → 'escalate' to 'resample'", () => {
    const state = createEscalationState();
    const decision = evaluateEscalation(state, { ...noSignals(), noProgress: true });

    assert.equal(decision.action, "escalate");
    assert.equal(decision.nextRung, "resample");
    assert.ok(decision.reason.includes("progress"));
  });

  it("budgetExhausted=true → 'escalate' to 'resample'", () => {
    const state = createEscalationState();
    const decision = evaluateEscalation(state, { ...noSignals(), budgetExhausted: true });

    assert.equal(decision.action, "escalate");
    assert.equal(decision.nextRung, "resample");
    assert.ok(decision.reason.includes("budget"));
  });

  it("timeExhausted=true → 'escalate' to 'resample'", () => {
    const state = createEscalationState();
    const decision = evaluateEscalation(state, { ...noSignals(), timeExhausted: true });

    assert.equal(decision.action, "escalate");
    assert.equal(decision.nextRung, "resample");
    assert.ok(decision.reason.includes("time"));
  });

  it("at max attempts for rung → 'escalate'", () => {
    const state = stateAtRung("retry", 3); // maxAttempts for retry is 3
    const decision = evaluateEscalation(state, noSignals());

    assert.equal(decision.action, "escalate");
    assert.equal(decision.nextRung, "resample");
    assert.ok(decision.reason.includes("max attempts"));
  });

  it("at 'human' rung with stuck → 'abort'", () => {
    const state = stateAtRung("human", 1);
    const decision = evaluateEscalation(state, { ...noSignals(), stuck: true });

    assert.equal(decision.action, "abort");
    assert.ok(decision.reason.includes("Human rung exhausted"));
    assert.equal(decision.state.currentRung, "human");
    assert.equal(decision.state.history.length, 1);
    assert.equal(decision.state.history[0].outcome, "aborted");
  });

  it("at 'human' rung with budgetExhausted → 'abort'", () => {
    const state = stateAtRung("human", 1);
    const decision = evaluateEscalation(state, { ...noSignals(), budgetExhausted: true });

    assert.equal(decision.action, "abort");
    assert.ok(decision.reason.includes("Human rung exhausted"));
  });

  it("at 'human' rung without stuck/budget → 'continue'", () => {
    const state = stateAtRung("human", 0);
    const decision = evaluateEscalation(state, noSignals());

    assert.equal(decision.action, "continue");
    assert.ok(decision.reason.includes("waiting for resolution"));
  });

  it("escalates through full ladder: retry → resample → re-decompose → stronger-model → human → abort", () => {
    let state = createEscalationState();
    let decision: ReturnType<typeof evaluateEscalation>;

    // retry (maxAttempts: 3)
    for (let i = 0; i < 3; i++) {
      state = recordFailure(state);
    }
    decision = evaluateEscalation(state, noSignals());
    assert.equal(decision.action, "escalate", "retry → escalate");
    assert.equal(decision.nextRung, "resample");
    state = decision.state;

    // resample (maxAttempts: 5)
    for (let i = 0; i < 5; i++) {
      state = recordFailure(state);
    }
    decision = evaluateEscalation(state, noSignals());
    assert.equal(decision.action, "escalate", "resample → escalate");
    assert.equal(decision.nextRung, "re-decompose");
    state = decision.state;

    // re-decompose (maxAttempts: 2)
    for (let i = 0; i < 2; i++) {
      state = recordFailure(state);
    }
    decision = evaluateEscalation(state, noSignals());
    assert.equal(decision.action, "escalate", "re-decompose → escalate");
    assert.equal(decision.nextRung, "stronger-model");
    state = decision.state;

    // stronger-model (maxAttempts: 1)
    state = recordFailure(state);
    decision = evaluateEscalation(state, noSignals());
    assert.equal(decision.action, "escalate", "stronger-model → escalate");
    assert.equal(decision.nextRung, "human");
    state = decision.state;

    // human — need a trigger to abort
    state = recordFailure(state);
    decision = evaluateEscalation(state, { ...noSignals(), stuck: true });
    assert.equal(decision.action, "abort", "human + stuck → abort");
    assert.ok(decision.reason.includes("Human rung exhausted"));
  });
});

// ── recordSuccess ──────────────────────────────────────────────────────

describe("recordSuccess", () => {
  it("increments attemptsAtRung and totalAttempts", () => {
    const state = createEscalationState();
    const next = recordSuccess(state);

    assert.equal(next.attemptsAtRung, 1);
    assert.equal(next.totalAttempts, 1);
  });

  it("preserves currentRung and history", () => {
    const state = stateAtRung("resample", 2);
    const next = recordSuccess(state);

    assert.equal(next.currentRung, "resample");
    assert.equal(next.attemptsAtRung, 3);
    assert.equal(next.totalAttempts, 3);
    assert.deepStrictEqual(next.history, []);
  });

  it("does not mutate original state", () => {
    const state = createEscalationState();
    const next = recordSuccess(state);

    assert.equal(state.attemptsAtRung, 0, "original unchanged");
    assert.equal(next.attemptsAtRung, 1, "copy incremented");
  });
});

// ── recordFailure ──────────────────────────────────────────────────────

describe("recordFailure", () => {
  it("increments attemptsAtRung and totalAttempts (same as recordSuccess)", () => {
    const state = createEscalationState();
    const next = recordFailure(state);

    assert.equal(next.attemptsAtRung, 1);
    assert.equal(next.totalAttempts, 1);
  });

  it("does not mutate original state", () => {
    const state = createEscalationState();
    recordFailure(state);

    assert.equal(state.attemptsAtRung, 0);
  });

  it("multiple failures accumulate", () => {
    let state = createEscalationState();
    state = recordFailure(state);
    state = recordFailure(state);
    state = recordFailure(state);

    assert.equal(state.attemptsAtRung, 3);
    assert.equal(state.totalAttempts, 3);
  });
});

// ── isStuck ────────────────────────────────────────────────────────────

describe("isStuck", () => {
  it("returns true when 2 or more triggers fire", () => {
    assert.ok(
      isStuck({ stuck: true, oscillating: true, noProgress: false, budgetExhausted: false, timeExhausted: false }),
    );
    assert.ok(
      isStuck({ stuck: true, oscillating: false, noProgress: true, budgetExhausted: false, timeExhausted: false }),
    );
    assert.ok(
      isStuck({ stuck: false, oscillating: false, noProgress: true, budgetExhausted: true, timeExhausted: false }),
    );
    assert.ok(
      isStuck({ stuck: true, oscillating: true, noProgress: true, budgetExhausted: true, timeExhausted: true }),
    );
  });

  it("returns false when only 1 trigger fires", () => {
    assert.ok(
      !isStuck({ stuck: true, oscillating: false, noProgress: false, budgetExhausted: false, timeExhausted: false }),
    );
    assert.ok(
      !isStuck({ stuck: false, oscillating: true, noProgress: false, budgetExhausted: false, timeExhausted: false }),
    );
    assert.ok(
      !isStuck({ stuck: false, oscillating: false, noProgress: true, budgetExhausted: false, timeExhausted: false }),
    );
    assert.ok(
      !isStuck({ stuck: false, oscillating: false, noProgress: false, budgetExhausted: true, timeExhausted: false }),
    );
    assert.ok(
      !isStuck({ stuck: false, oscillating: false, noProgress: false, budgetExhausted: false, timeExhausted: true }),
    );
  });

  it("returns false when no triggers fire", () => {
    assert.ok(!isStuck(noSignals()));
  });
});

// ── resetToRetry ───────────────────────────────────────────────────────

describe("resetToRetry", () => {
  it("resets to 'retry' rung with 0 attempts", () => {
    const state = stateAtRung("re-decompose", 2);
    const next = resetToRetry(state);

    assert.equal(next.currentRung, "retry");
    assert.equal(next.attemptsAtRung, 0);
  });

  it("preserves totalAttempts and history", () => {
    const state: EscalationState = {
      currentRung: "stronger-model",
      attemptsAtRung: 1,
      totalAttempts: 11,
      history: [{ rung: "retry", attempts: 3, outcome: "escalated" }],
    };
    const next = resetToRetry(state);

    assert.equal(next.totalAttempts, 11);
    assert.equal(next.history.length, 1);
    assert.equal(next.currentRung, "retry");
    assert.equal(next.attemptsAtRung, 0);
  });

  it("does not mutate original state", () => {
    const state = stateAtRung("stronger-model", 1);
    resetToRetry(state);

    assert.equal(state.currentRung, "stronger-model", "original unchanged");
  });
});
