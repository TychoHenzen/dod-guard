/**
 * Failure-shape signals for one attempt.
 *
 * The signature history drives both the escalation ladder and the
 * diagnostics the caller reads back.
 */

import { computeFailureSignals } from "./agent.js";
import type { AttemptResult } from "./attempt-result.js";
import type { EscalationDecision, TriggerSignals } from "./escalation.js";

const RETRY_RUNGS = new Set(["retry", "resample"]);

function failureMode(
  signals: ReturnType<typeof computeFailureSignals>,
): "stuck" | "oscillating" | "noProgress" | "unknown" {
  if (signals.stuck) return "stuck";
  if (signals.oscillating) return "oscillating";
  if (signals.noProgress) return "noProgress";
  return "unknown";
}

/**
 * Read the signals for the current history and record them on the
 * attempt diagnostic. The final status stays with the caller, which knows
 * whether the ladder stopped the lineage.
 */
export function readSignals(state: AttemptResult, history: string[]): TriggerSignals {
  const signals = computeFailureSignals(history);
  const diagnostic = state.diagnostic;
  diagnostic.signature_history = { signatures: [...history], ...signals };
  diagnostic.failure_mode = failureMode(signals);
  return { ...signals, budgetExhausted: false, timeExhausted: false };
}

/** True while the ladder still offers the attempt another try. */
export function canContinue(decision: EscalationDecision): boolean {
  if (decision.action === "abort") return false;
  return RETRY_RUNGS.has(decision.state.currentRung);
}
