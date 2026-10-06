import { evaluateConvergence } from "../../next-ticket/scripts/structured-workflow-proof.mjs";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function lensEvidenceRemainder(handoff) {
  const matrix = Array.isArray(handoff.acceptanceMatrix) ? handoff.acceptanceMatrix : [];
  const matrixProofs = new Set(matrix.map((row) => text(row?.proof)).filter(Boolean));
  const matrixEvidence = new Set(matrix.map((row) => text(row?.evidence)).filter(Boolean));
  const remainder = [];
  for (const lens of Array.isArray(handoff.reviewLenses) ? handoff.reviewLenses : []) {
    const id = text(lens?.id ?? lens?.name) ?? "review lens";
    if (!matrixProofs.has(text(lens?.verificationEvidence))) {
      remainder.push(`${id} review lens needs acceptance-matrix verification evidence`);
    }
    if (!matrixEvidence.has(text(lens?.acceptanceEvidence))) {
      remainder.push(`${id} review lens needs acceptance-matrix acceptance evidence`);
    }
  }
  return remainder;
}

export function evaluateStructuredFinalization(handoff) {
  const convergence = evaluateConvergence(handoff);
  const lensRemainder = convergence.outcome === "verified" ? lensEvidenceRemainder(handoff) : [];
  const finalRemainder = [...convergence.remainder, ...lensRemainder];
  const finalOutcome = finalRemainder.length === 0 ? "verified" : "actionable remainder";
  let nextStep = "stop";
  if (finalOutcome === "verified") nextStep = "project-status.mjs";
  const finalConvergence = {
    ...convergence,
    outcome: finalOutcome,
    remainder: finalRemainder,
  };
  return {
    ...finalConvergence,
    nextStep,
  };
}
