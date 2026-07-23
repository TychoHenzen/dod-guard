import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceStage,
  checkStageGate,
  completeStage,
  createOrchestrator,
  failStage,
  loadPlaybook,
  orchestratorSummary,
  shouldContinue,
  stageToBudgetStage,
  type OrchestratorState,
} from "./orchestrator.js";

// ── createOrchestrator ─────────────────────────────────────────────────

describe("createOrchestrator", () => {
  it("creates initial state with null stage", () => {
    const state = createOrchestrator();
    assert.equal(state.currentStage, null);
    assert.equal(state.completed, false);
    assert.equal(state.aborted, false);
    assert.equal(state.flags.size, 0);
    assert.equal(state.stageOutputs != null, true);
  });
});

// ── advanceStage ───────────────────────────────────────────────────────

describe("advanceStage", () => {
  it("advances from null to spec", () => {
    const state = createOrchestrator();
    const result = advanceStage(state);
    assert.equal(result.stage, "spec");
    assert.equal(result.gate.canEnter, true);
    assert.equal(state.currentStage, "spec");
  });

  it("advances spec → test_author", () => {
    const state = createOrchestrator();
    advanceStage(state); // spec
    completeStage(state, "spec", 0, 0);
    const result = advanceStage(state);
    assert.equal(result.stage, "test_author");
  });

  it("advances test_author → implement", () => {
    const state = createOrchestrator();
    advanceStage(state); // spec
    completeStage(state, "spec", 0, 0);
    advanceStage(state); // test_author
    completeStage(state, "test_author", 0, 0);
    const result = advanceStage(state);
    assert.equal(result.stage, "implement");
  });

  it("advances implement → harden", () => {
    const state = createOrchestrator();
    advanceStage(state); // spec
    completeStage(state, "spec", 0, 0);
    advanceStage(state); // test_author
    completeStage(state, "test_author", 0, 0);
    advanceStage(state); // implement
    completeStage(state, "implement", 0, 0);
    const result = advanceStage(state);
    assert.equal(result.stage, "harden");
  });

  it("advances harden → review", () => {
    const state = createOrchestrator();
    for (const stage of ["spec", "test_author", "implement", "harden"] as const) {
      advanceStage(state);
      completeStage(state, stage, 0, 0);
    }
    const result = advanceStage(state);
    assert.equal(result.stage, "review");
  });

  it("advances review → merge", () => {
    const state = createOrchestrator();
    for (const stage of ["spec", "test_author", "implement", "harden", "review"] as const) {
      advanceStage(state);
      completeStage(state, stage, 0, 0);
    }
    const result = advanceStage(state);
    assert.equal(result.stage, "merge");
  });

  it("completes after merge", () => {
    const state = createOrchestrator();
    for (const stage of ["spec", "test_author", "implement", "harden", "review", "merge"] as const) {
      advanceStage(state);
      completeStage(state, stage, 0, 0);
    }
    const result = advanceStage(state);
    assert.equal(result.stage, null);
    assert.equal(state.completed, true);
  });
});

// ── checkStageGate ─────────────────────────────────────────────────────

describe("checkStageGate", () => {
  it("spec always can enter", () => {
    const state = createOrchestrator();
    const gate = checkStageGate(state, "spec");
    assert.equal(gate.canEnter, true);
  });

  it("test_author blocked without spec_locked flag", () => {
    const state = createOrchestrator();
    const gate = checkStageGate(state, "test_author");
    assert.equal(gate.canEnter, false);
    assert.ok(gate.enterBlockReason?.includes("Spec not locked"));
  });

  it("test_author allowed with spec_locked flag", () => {
    const state = createOrchestrator();
    state.flags.add("spec_locked");
    const gate = checkStageGate(state, "test_author");
    assert.equal(gate.canEnter, true);
  });

  it("implement blocked without tests_locked and tests_red", () => {
    const state = createOrchestrator();
    const gate = checkStageGate(state, "implement");
    assert.equal(gate.canEnter, false);
  });

  it("implement allowed with both test flags", () => {
    const state = createOrchestrator();
    state.flags.add("tests_locked");
    state.flags.add("tests_red");
    const gate = checkStageGate(state, "implement");
    assert.equal(gate.canEnter, true);
  });

  it("harden blocked without implement_pass", () => {
    const state = createOrchestrator();
    const gate = checkStageGate(state, "harden");
    assert.equal(gate.canEnter, false);
  });

  it("review blocked without harden_pass", () => {
    const state = createOrchestrator();
    const gate = checkStageGate(state, "review");
    assert.equal(gate.canEnter, false);
  });

  it("merge blocked without review_pass", () => {
    const state = createOrchestrator();
    const gate = checkStageGate(state, "merge");
    assert.equal(gate.canEnter, false);
  });
});

// ── completeStage ──────────────────────────────────────────────────────

describe("completeStage", () => {
  it("sets spec_locked on spec complete", () => {
    const state = createOrchestrator();
    completeStage(state, "spec", 100, 500);
    assert.equal(state.flags.has("spec_locked"), true);
  });

  it("sets tests_locked and tests_red on test_author complete", () => {
    const state = createOrchestrator();
    completeStage(state, "test_author", 0, 0);
    assert.equal(state.flags.has("tests_locked"), true);
    assert.equal(state.flags.has("tests_red"), true);
  });

  it("sets implement_pass on implement complete", () => {
    const state = createOrchestrator();
    completeStage(state, "implement", 0, 0);
    assert.equal(state.flags.has("implement_pass"), true);
  });

  it("sets harden_pass on harden complete", () => {
    const state = createOrchestrator();
    completeStage(state, "harden", 0, 0);
    assert.equal(state.flags.has("harden_pass"), true);
  });

  it("sets review_pass on review complete", () => {
    const state = createOrchestrator();
    completeStage(state, "review", 0, 0);
    assert.equal(state.flags.has("review_pass"), true);
  });

  it("sets completed on merge", () => {
    const state = createOrchestrator();
    completeStage(state, "merge", 0, 0);
    assert.equal(state.completed, true);
  });
});

// ── failStage ──────────────────────────────────────────────────────────

describe("failStage", () => {
  it("does not abort on first failure", () => {
    const state = createOrchestrator();
    failStage(state, "implement", 500, 1000, {
      stuck: false,
      oscillating: false,
      noProgress: false,
      budgetExhausted: false,
      timeExhausted: false,
    });
    assert.equal(state.aborted, false);
    assert.ok(state.escalation.attemptsAtRung >= 1);
  });
});

// ── shouldContinue ─────────────────────────────────────────────────────

describe("shouldContinue", () => {
  it("returns true for fresh state", () => {
    assert.equal(shouldContinue(createOrchestrator()), true);
  });

  it("returns false when completed", () => {
    const state = createOrchestrator();
    state.completed = true;
    assert.equal(shouldContinue(state), false);
  });

  it("returns false when aborted", () => {
    const state = createOrchestrator();
    state.aborted = true;
    assert.equal(shouldContinue(state), false);
  });
});

// ── stageToBudgetStage ─────────────────────────────────────────────────

describe("stageToBudgetStage", () => {
  it("maps all stages", () => {
    assert.equal(stageToBudgetStage("spec"), "spec");
    assert.equal(stageToBudgetStage("test_author"), "test_author");
    assert.equal(stageToBudgetStage("implement"), "implement");
    assert.equal(stageToBudgetStage("harden"), "harden");
    assert.equal(stageToBudgetStage("review"), "review");
    assert.equal(stageToBudgetStage("merge"), "merge");
  });
});

// ── loadPlaybook ───────────────────────────────────────────────────────

describe("loadPlaybook", () => {
  it("returns stages for all playbook types", () => {
    for (const type of ["bugfix", "feature", "refactor", "test-harden", "reconcile", "review"] as const) {
      const pb = loadPlaybook(type);
      assert.ok(pb.stages.length > 0);
      assert.equal(pb.stages[0], "spec");
      assert.equal(pb.stages[pb.stages.length - 1], "merge");
    }
  });
});

// ── orchestratorSummary ────────────────────────────────────────────────

describe("orchestratorSummary", () => {
  it("includes stage info", () => {
    const state = createOrchestrator();
    state.currentStage = "implement";
    const summary = orchestratorSummary(state);
    assert.ok(summary.includes("Implementation"));
    assert.ok(summary.includes("not started") === false || summary.includes("Stage:"));
  });

  it("shows flags when present", () => {
    const state = createOrchestrator();
    state.flags.add("spec_locked");
    const summary = orchestratorSummary(state);
    assert.ok(summary.includes("spec_locked"));
  });

  it("shows (none) when no flags", () => {
    const state = createOrchestrator();
    const summary = orchestratorSummary(state);
    assert.ok(summary.includes("(none)"));
  });
});
