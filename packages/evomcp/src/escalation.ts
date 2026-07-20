/**
 * Escalation ladder — graduated response to stuck/oscillating/failing tasks.
 *
 * Evo-goals.md: "retry → resample → re-decompose → re-plan → stronger model → human"
 *
 * Every rung has:
 *  - Trigger conditions (when to move up)
 *  - Budget (max attempts/tokens at this rung)
 *  - Action (what to do differently)
 *
 * The orchestrator calls `evaluate()` after each attempt and escalates
 * when the trigger fires. Pure state machine — no I/O, no side effects.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type RungLevel = "retry" | "resample" | "re-decompose" | "stronger-model" | "human";

export interface RungConfig {
  level: RungLevel;
  /** Max attempts at this rung before auto-escalation. */
  maxAttempts: number;
  /** Description of what changes at this rung. */
  description: string;
}

export interface EscalationState {
  currentRung: RungLevel;
  attemptsAtRung: number;
  totalAttempts: number;
  history: RungHistoryEntry[];
}

export interface RungHistoryEntry {
  rung: RungLevel;
  attempts: number;
  outcome: "escalated" | "resolved" | "aborted";
  reason?: string;
}

export interface EscalationDecision {
  /** What the orchestrator should do next. */
  action: "continue" | "escalate" | "abort" | "done";
  /** If escalated: which rung to move to. */
  nextRung?: RungLevel;
  /** Human-readable reason for the decision. */
  reason: string;
  /** The current state after applying the decision. */
  state: EscalationState;
}

// ── Default rung configs ───────────────────────────────────────────────

const DEFAULT_RUNGS: RungConfig[] = [
  { level: "retry", maxAttempts: 3, description: "Same strategy, fresh attempt." },
  { level: "resample", maxAttempts: 5, description: "Different strategy, new plan." },
  { level: "re-decompose", maxAttempts: 2, description: "Split task into smaller subtasks." },
  { level: "stronger-model", maxAttempts: 1, description: "Switch from DeepSeek to Sonnet/Opus." },
  { level: "human", maxAttempts: 1, description: "Structured escalation report for human review." },
];

const RUNG_INDEX: Record<RungLevel, number> = {
  retry: 0,
  resample: 1,
  "re-decompose": 2,
  "stronger-model": 3,
  human: 4,
};

// ── Trigger signal types ───────────────────────────────────────────────

export interface TriggerSignals {
  /** True if the same failure signature appeared 2+ consecutive attempts. */
  stuck: boolean;
  /** True if scores alternate between two values. */
  oscillating: boolean;
  /** True if edit distance collapsed to 0 across retries. */
  noProgress: boolean;
  /** True if token budget exceeded at current rung. */
  budgetExhausted: boolean;
  /** True if wall-time budget exceeded at current rung. */
  timeExhausted: boolean;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Create a fresh escalation state at the "retry" rung.
 */
export function createEscalationState(): EscalationState {
  return {
    currentRung: "retry",
    attemptsAtRung: 0,
    totalAttempts: 0,
    history: [],
  };
}

/**
 * Evaluate whether to escalate given trigger signals and current state.
 *
 * Call this after each attempt. The returned `action` tells the orchestrator
 * what to do next. The caller must apply the state change (the returned
 * `state` field has already been updated).
 */
export function evaluateEscalation(
  state: EscalationState,
  signals: TriggerSignals,
  rungs?: RungConfig[],
): EscalationDecision {
  const configs = rungs ?? DEFAULT_RUNGS;
  const currentConfig = configs.find((r) => r.level === state.currentRung) ?? configs[0];

  // If at human rung and failed → abort (nowhere higher to go)
  if (state.currentRung === "human") {
    if (signals.stuck || signals.budgetExhausted) {
      const newState = recordHistory(state, "aborted", "Human rung exhausted.");
      return {
        action: "abort",
        reason: "Human rung exhausted — task cannot be solved automatically.",
        state: newState,
      };
    }
    // Still working at human rung — continue
    return { action: "continue", reason: "Human rung: waiting for resolution.", state };
  }

  // Check triggers for escalation
  const shouldEscalate =
    signals.stuck ||
    signals.oscillating ||
    signals.noProgress ||
    signals.budgetExhausted ||
    signals.timeExhausted ||
    state.attemptsAtRung >= currentConfig.maxAttempts;

  if (shouldEscalate) {
    const nextRung = nextRungLevel(state.currentRung, configs);
    if (!nextRung) {
      const newState = recordHistory(state, "aborted", "No higher rung available.");
      return { action: "abort", reason: "No higher rung available.", state: newState };
    }

    const reason = buildEscalationReason(state.currentRung, nextRung, signals, currentConfig);
    const newState = recordHistory(state, "escalated", reason);
    newState.currentRung = nextRung;
    newState.attemptsAtRung = 0;

    return { action: "escalate", nextRung, reason, state: newState };
  }

  return { action: "continue", reason: "Continuing at current rung.", state };
}

/**
 * Record a successful attempt at the current rung.
 * Returns updated state. Does NOT reset the rung — the orchestrator
 * decides whether to stay or move down.
 */
export function recordSuccess(state: EscalationState): EscalationState {
  return {
    ...state,
    attemptsAtRung: state.attemptsAtRung + 1,
    totalAttempts: state.totalAttempts + 1,
  };
}

/**
 * Record a failed attempt at the current rung.
 * Caller should then call evaluateEscalation() to decide next step.
 */
export function recordFailure(state: EscalationState): EscalationState {
  return {
    ...state,
    attemptsAtRung: state.attemptsAtRung + 1,
    totalAttempts: state.totalAttempts + 1,
  };
}

/**
 * Check if signals indicate the task is stuck.
 * Composite check: stuck if 2+ trigger types fire.
 */
export function isStuck(signals: TriggerSignals): boolean {
  const triggers = [
    signals.stuck,
    signals.oscillating,
    signals.noProgress,
    signals.budgetExhausted,
    signals.timeExhausted,
  ];
  return triggers.filter(Boolean).length >= 2;
}

/**
 * Move from a "re-decompose" rung back down to "retry" when decomposition succeeds.
 */
export function resetToRetry(state: EscalationState): EscalationState {
  return {
    ...state,
    currentRung: "retry",
    attemptsAtRung: 0,
  };
}

// ── Internal ───────────────────────────────────────────────────────────

function nextRungLevel(current: RungLevel, configs: RungConfig[]): RungLevel | null {
  const idx = RUNG_INDEX[current];
  if (idx === undefined) return null;
  const next = configs[idx + 1];
  return next?.level ?? null;
}

function buildEscalationReason(from: RungLevel, to: RungLevel, signals: TriggerSignals, config: RungConfig): string {
  const triggers: string[] = [];
  if (signals.stuck) triggers.push("stuck (same failure 2+ consecutive)");
  if (signals.oscillating) triggers.push("oscillating");
  if (signals.noProgress) triggers.push("no progress (edit distance collapsed)");
  if (signals.budgetExhausted) triggers.push("budget exhausted");
  if (signals.timeExhausted) triggers.push("time exhausted");

  if (triggers.length === 0) {
    triggers.push(`max attempts reached (${config.maxAttempts})`);
  }

  return `Escalated from ${from} to ${to}: ${triggers.join(", ")}.`;
}

function recordHistory(
  state: EscalationState,
  outcome: "escalated" | "resolved" | "aborted",
  reason: string,
): EscalationState {
  return {
    ...state,
    history: [
      ...state.history,
      {
        rung: state.currentRung,
        attempts: state.attemptsAtRung,
        outcome,
        reason,
      },
    ],
  };
}
