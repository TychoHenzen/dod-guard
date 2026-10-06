import { evaluateConvergence } from "../../next-ticket/scripts/structured-workflow-proof.mjs";

export function evaluateStructuredFinalization(handoff) {
  const convergence = evaluateConvergence(handoff);
  let nextStep = "stop";
  if (convergence.outcome === "verified") nextStep = "project-status.mjs";
  return {
    convergence,
    ...convergence,
    nextStep,
  };
}
