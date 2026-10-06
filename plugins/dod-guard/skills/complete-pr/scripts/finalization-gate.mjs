import { evaluateConvergence } from "../../next-ticket/scripts/structured-workflow-proof.mjs";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function values(value) {
  if (Array.isArray(value)) return value.flatMap(values);
  const result = text(value);
  return result ? [result] : [];
}

function lensEvidenceRemainder(handoff) {
  const matrix = Array.isArray(handoff.acceptanceMatrix) ? handoff.acceptanceMatrix : [];
  const matrixProofs = new Set(matrix.map((row) => text(row?.proof)).filter(Boolean));
  const matrixEvidence = new Set(matrix.map((row) => text(row?.evidence)).filter(Boolean));
  const expectedHead = text(handoff.headSha);
  const tasks = Array.isArray(handoff.tasks) ? handoff.tasks : [];
  const remainder = [];
  for (const lens of Array.isArray(handoff.reviewLenses) ? handoff.reviewLenses : []) {
    const id = text(lens?.id ?? lens?.name) ?? "review lens";
    if (text(lens?.headSha ?? lens?.head) !== expectedHead) {
      remainder.push(`${id} review lens is not bound to handoff head ${expectedHead ?? "an exact pushed head"}`);
    }
    const owner = text(lens?.owner);
    const ownerTask = tasks.find((task) => text(task?.id) === owner)
      ?? tasks.find((task) => text(task?.child) === owner);
    const ownerAcceptance = values(ownerTask?.acceptanceEvidence);
    const ownerVerification = values(ownerTask?.verificationEvidence);
    if (ownerAcceptance.length === 0 || !ownerAcceptance.includes(text(lens?.acceptanceEvidence))) {
      remainder.push(`${id} owner task needs mapped acceptance evidence`);
    }
    if (ownerVerification.length === 0 || !ownerVerification.includes(text(lens?.verificationEvidence))) {
      remainder.push(`${id} owner task needs mapped verification evidence`);
    }
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
  const lensRemainder = lensEvidenceRemainder(handoff);
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
