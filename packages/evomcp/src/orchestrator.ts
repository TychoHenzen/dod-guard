/**
 * Deterministic orchestrator state machine.
 *
 * Evo_target.md: "The orchestrator is code, not a model. Weak models don't
 * follow instructions; they follow rails. Stage transitions, budgets, and
 * escalation live in deterministic logic."
 *
 * This module enforces the stage lifecycle for all playbooks:
 *   SPEC → TEST_AUTHOR → IMPLEMENT → HARDEN → REVIEW → MERGE
 *
 * Each stage has:
 *  - canEnter() / canExit() gates
 *  - Budget tracking
 *  - Escalation signals
 *  - Integration with solve/evolve for the IMPLEMENT stage
 *
 * The orchestrator does NOT implement the stages — it only enforces the
 * transitions. Each stage is implemented by solve.ts, evolve.ts, or
 * external agents (Spec Architect, Reviewer, etc.).
 */

import { type BudgetStage, type BudgetState, createBudgetState, recordAttempt } from "./budget.js";
import {
  createEscalationState,
  type EscalationState,
  evaluateEscalation,
  recordFailure,
  recordSuccess,
  type TriggerSignals,
} from "./escalation.js";
import type { SolveResult } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────────

export type PlaybookStage = "spec" | "test_author" | "implement" | "harden" | "review" | "merge";

export const PLAYBOOK_STAGES: PlaybookStage[] = ["spec", "test_author", "implement", "harden", "review", "merge"];

export const STAGE_LABELS: Record<PlaybookStage, string> = {
  spec: "Specification",
  test_author: "Test Authoring",
  implement: "Implementation",
  harden: "Test Hardening",
  review: "Review",
  merge: "Merge",
};

export interface StageGate {
  /** Stage this gate belongs to. */
  stage: PlaybookStage;
  /** Whether the stage can be entered. */
  canEnter: boolean;
  /** Reason if canEnter is false. */
  enterBlockReason?: string;
  /** Whether the stage can be exited (moving to next). */
  canExit: boolean;
  /** Reason if canExit is false. */
  exitBlockReason?: string;
}

export interface OrchestratorState {
  /** Current stage in the playbook. */
  currentStage: PlaybookStage | null;
  /** Whether the playbook has completed successfully. */
  completed: boolean;
  /** Whether the playbook was aborted. */
  aborted: boolean;
  /** Reason for abort, if any. */
  abortReason?: string;
  /** Budget tracker. */
  budget: BudgetState;
  /** Escalation tracker. */
  escalation: EscalationState;
  /** Solve result from the implement stage (if any). */
  solveResult?: SolveResult;
  /** Per-stage outputs for handoff between stages. */
  stageOutputs: Partial<Record<PlaybookStage, unknown>>;
  /** Flags set by stages to signal readiness. */
  flags: Set<string>;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Initialize an orchestrator for a new playbook run.
 */
export function createOrchestrator(): OrchestratorState {
  return {
    currentStage: null,
    completed: false,
    aborted: false,
    budget: createBudgetState(),
    escalation: createEscalationState(),
    stageOutputs: {},
    flags: new Set(),
  };
}

/**
 * Transition to the next stage in the playbook.
 *
 * @returns The new stage name, or null if all stages complete or blocked.
 */
export function advanceStage(state: OrchestratorState): { stage: PlaybookStage | null; gate: StageGate } {
  const currentIdx = state.currentStage ? PLAYBOOK_STAGES.indexOf(state.currentStage) : -1;
  const nextIdx = currentIdx + 1;

  if (nextIdx >= PLAYBOOK_STAGES.length) {
    state.completed = true;
    return {
      stage: null,
      gate: {
        stage: "merge",
        canEnter: true,
        canExit: true,
      },
    };
  }

  const nextStage = PLAYBOOK_STAGES[nextIdx];
  const gate = checkStageGate(state, nextStage);

  if (gate.canEnter) {
    state.currentStage = nextStage;
  }

  return { stage: gate.canEnter ? nextStage : null, gate };
}

/**
 * Check whether a stage can be entered and exited given current state.
 */
export function checkStageGate(state: OrchestratorState, stage: PlaybookStage): StageGate {
  const result: StageGate = {
    stage,
    canEnter: true,
    canExit: false,
  };

  // Per-stage entry gates
  switch (stage) {
    case "spec":
      // No prerequisites — always can enter
      break;

    case "test_author":
      if (!state.flags.has("spec_locked")) {
        result.canEnter = false;
        result.enterBlockReason = "Spec not locked. Human must sign off on Criteria/Contracts first.";
      }
      break;

    case "implement":
      if (!(state.flags.has("tests_locked") && state.flags.has("tests_red"))) {
        result.canEnter = false;
        result.enterBlockReason =
          "Tests not locked or not confirmed red. Tests must exist and fail before implementation.";
      }
      break;

    case "harden":
      if (!state.flags.has("implement_pass")) {
        result.canEnter = false;
        result.enterBlockReason = "Implementation must pass oracle stack before hardening.";
      }
      break;

    case "review":
      if (!state.flags.has("harden_pass")) {
        result.canEnter = false;
        result.enterBlockReason = "Hardening must pass (mutation kill rate ≥ threshold) before review.";
      }
      break;

    case "merge":
      if (!state.flags.has("review_pass")) {
        result.canEnter = false;
        result.enterBlockReason = "Review must pass before merge.";
      }
      break;
  }

  // Budget exhaustion blocks entry
  if (result.canEnter && state.budget.exhausted) {
    result.canEnter = false;
    result.enterBlockReason = "Budget exhausted — escalate to higher rung or abort.";
  }

  return result;
}

/**
 * Signal that a stage has completed successfully.
 * Sets the appropriate flag and updates budget.
 */
export function completeStage(
  state: OrchestratorState,
  stage: PlaybookStage,
  tokens: number,
  ms: number,
  _edges = 1,
): OrchestratorState {
  state.budget = recordAttempt(state.budget, stageToBudgetStage(stage), tokens, ms);

  // Set stage-specific completion flags
  switch (stage) {
    case "spec":
      state.flags.add("spec_locked");
      break;
    case "test_author":
      state.flags.add("tests_locked");
      state.flags.add("tests_red");
      break;
    case "implement":
      state.flags.add("implement_pass");
      break;
    case "harden":
      state.flags.add("harden_pass");
      break;
    case "review":
      state.flags.add("review_pass");
      break;
    case "merge":
      state.completed = true;
      break;
  }

  state.escalation = recordSuccess(state.escalation);

  return state;
}

/**
 * Signal that a stage attempt failed.
 * Evaluates escalation triggers and returns the decision.
 */
export function failStage(
  state: OrchestratorState,
  stage: PlaybookStage,
  tokens: number,
  ms: number,
  signals: TriggerSignals,
): OrchestratorState {
  state.budget = recordAttempt(state.budget, stageToBudgetStage(stage), tokens, ms);
  state.escalation = recordFailure(state.escalation);

  const decision = evaluateEscalation(state.escalation, signals);
  state.escalation = decision.state;

  if (decision.action === "abort") {
    state.aborted = true;
    state.abortReason = decision.reason;
  }

  return state;
}

/**
 * Check if the orchestrator should continue or stop.
 */
export function shouldContinue(state: OrchestratorState): boolean {
  return !(state.completed || state.aborted || state.budget.exhausted);
}

/**
 * Build a stuck-detection signal set from solve/evolve results.
 */
export function buildTriggerSignals(
  sameFailureConsecutive: boolean,
  oscillating: boolean,
  editDistanceZero: boolean,
  budgetExhausted: boolean,
  timeExhausted: boolean,
): TriggerSignals {
  return {
    stuck: sameFailureConsecutive,
    oscillating,
    noProgress: editDistanceZero,
    budgetExhausted,
    timeExhausted,
  };
}

/**
 * Map playbook stage to budget stage.
 */
export function stageToBudgetStage(stage: PlaybookStage): BudgetStage {
  const map: Record<PlaybookStage, BudgetStage> = {
    spec: "spec",
    test_author: "test_author",
    implement: "implement",
    harden: "harden",
    review: "review",
    merge: "merge",
  };
  return map[stage];
}

/**
 * Human-readable orchestrator status.
 */
export function orchestratorSummary(state: OrchestratorState): string {
  const lines: string[] = [
    "## Orchestrator Status",
    "",
    `Stage: ${state.currentStage ? STAGE_LABELS[state.currentStage] : "not started"}`,
    `Completed: ${state.completed ? "YES" : "no"}`,
    `Aborted: ${state.aborted ? `YES — ${state.abortReason ?? "unknown"}` : "no"}`,
    `Budget exhausted: ${state.budget.exhausted ? "YES" : "no"}`,
    `Escalation rung: ${state.escalation.currentRung} (attempts: ${state.escalation.attemptsAtRung})`,
    "",
    "### Flags",
  ];

  if (state.flags.size === 0) {
    lines.push("(none)");
  } else {
    for (const flag of [...state.flags].sort()) {
      lines.push(`- ${flag}`);
    }
  }

  return lines.join("\n");
}

/**
 * Load a playbook definition. Currently all playbooks share the same
 * stage sequence; in future phases, each playbook may have a subset
 * or different ordering.
 */
export function loadPlaybook(_type: "bugfix" | "feature" | "refactor" | "test-harden" | "reconcile" | "review"): {
  stages: PlaybookStage[];
  hardGates: string[];
} {
  return {
    stages: PLAYBOOK_STAGES,
    hardGates: [],
  };
}
