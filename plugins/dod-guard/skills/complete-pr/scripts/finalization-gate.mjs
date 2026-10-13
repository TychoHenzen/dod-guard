import { evaluateConvergence } from "../../next-ticket/scripts/structured-workflow-proof.mjs";

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

// Finalization runs after the merge, so it is always post-push convergence:
// the lens-row rules come from evaluateConvergence on the observed matrix at
// the exact pushed head. A planned matrix from the issue body is not
// acceptance evidence here, and a missing head stops instead of falling back
// to the pre-push checks.
export function evaluateStructuredFinalization(handoff) {
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
    return {
      outcome: "actionable remainder",
      remainder: ["finalization handoff must be an object"],
      sections: {},
      nextAction: null,
      nextStep: "stop",
    };
  }
  const convergence = evaluateConvergence({ ...handoff, plannedAcceptanceMatrix: null });
  if (convergence.outcome === "ordinary") {
    return {
      ...convergence,
      outcome: "actionable remainder",
      remainder: ["structured finalization cannot use the ordinary delivery path"],
      nextStep: "stop",
    };
  }
  const remainder = hasText(handoff.headSha)
    ? convergence.remainder
    : [...convergence.remainder, "finalization needs an exact pushed head"];
  const outcome = remainder.length === 0 ? "verified" : "actionable remainder";
  return {
    ...convergence,
    outcome,
    remainder,
    nextStep: outcome === "verified" ? "project-status.mjs" : "stop",
  };
}
