/**
 * Failure-shape signals for one attempt.
 *
 * The signature history drives both the escalation ladder and the
 * diagnostics the caller reads back.
 */

import { computeFailureSignals } from "./agent.js";
import type { AttemptResult } from "./attempt-result.js";
import type { EscalationDecision } from "./escalation.js";

const RETRY_RUNGS = new Set(["retry", "resample"]);

/** What the signature history says about the shape of the failures. */
type Signals = ReturnType<typeof computeFailureSignals>;

function failureMode(
  signals: ReturnType<typeof computeFailureSignals>,
): "stuck" | "oscillating" | "noProgress" | "unknown" {
  if (signals.stuck) return "stuck";
  if (signals.oscillating) return "oscillating";
  if (signals.noProgress) return "noProgress";
  return "unknown";
}

/**
 * Read the failure shape for the current history and record it on the
 * attempt diagnostic. The final status stays with the caller, which knows
 * whether the ladder stopped the lineage.
 *
 * The ladder also weighs budget and wall time. Neither is visible here, so
 * the caller adds them.
 */
export function readSignals(state: AttemptResult, history: string[]): Signals {
  const signals = computeFailureSignals(history);
  const diagnostic = state.diagnostic;
  diagnostic.signature_history = { signatures: [...history], ...signals };
  diagnostic.failure_mode = failureMode(signals);
  return signals;
}

/** True while the ladder still offers the attempt another try. */
export function canContinue(decision: EscalationDecision): boolean {
  if (decision.action === "abort") return false;
  return RETRY_RUNGS.has(decision.state.currentRung);
}
