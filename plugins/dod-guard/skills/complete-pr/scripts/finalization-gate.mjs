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
  const expectedHead = text(handoff.headSha);
  if (!expectedHead) return ["finalization needs an exact pushed head"];
  const matrixReference = (field, value, label) => {
    const normalizedValue = text(value);
    const matches = matrix.filter(
      (row) => text(row?.[field]) === normalizedValue,
    );
    if (!normalizedValue || matches.length === 0) {
      return `${label} is not mapped in the acceptance matrix`;
    }
    if (matches.length > 1) {
      return `${label} is mapped to multiple acceptance-matrix rows`;
    }
    if (text(matches[0]?.headSha) !== expectedHead) {
      return `${label} is bound to ${text(matches[0]?.headSha) ?? "no head"}, expected ${expectedHead}`;
    }
    return null;
  };
  const matrixRows = (field, value) => {
    const normalizedValue = text(value);
    return normalizedValue
      ? matrix.filter((row) => text(row?.[field]) === normalizedValue)
      : [];
  };
  const tasks = Array.isArray(handoff.tasks) ? handoff.tasks : [];
  const remainder = [];
  for (const lens of Array.isArray(handoff.reviewLenses) ? handoff.reviewLenses : []) {
    const id = text(lens?.id ?? lens?.name) ?? "review lens";
    if (text(lens?.headSha ?? lens?.head) !== expectedHead) {
      remainder.push(`${id} review lens is not bound to handoff head ${expectedHead}`);
    }
    const owner = text(lens?.owner);
    const ownerTask = tasks.find((task) => text(task?.id) === owner)
      ?? tasks.find((task) => text(task?.child) === owner);
    const ownerAcceptance = values(ownerTask?.acceptanceEvidence);
    const ownerVerification = values(ownerTask?.verificationEvidence);
    if (
      ownerAcceptance.length === 0
      || !ownerAcceptance.includes(text(lens?.acceptanceEvidence))
    ) {
      remainder.push(`${id} owner task needs mapped acceptance evidence`);
    }
    if (
      ownerVerification.length === 0
      || !ownerVerification.includes(text(lens?.verificationEvidence))
    ) {
      remainder.push(`${id} owner task needs mapped verification evidence`);
    }
    const verificationRemainder = matrixReference(
      "proof",
      lens?.verificationEvidence,
      `${id} review lens verification evidence`,
    );
    if (verificationRemainder) remainder.push(verificationRemainder);
    const acceptanceRemainder = matrixReference(
      "evidence",
      lens?.acceptanceEvidence,
      `${id} review lens acceptance evidence`,
    );
    if (acceptanceRemainder) remainder.push(acceptanceRemainder);
    const acceptanceRows = matrixRows("evidence", lens?.acceptanceEvidence);
    const verificationRows = matrixRows("proof", lens?.verificationEvidence);
    if (
      !verificationRemainder
      && !acceptanceRemainder
      && acceptanceRows[0] !== verificationRows[0]
    ) {
      remainder.push(`${id} review lens acceptance and verification evidence must share one acceptance-matrix row`);
    }
  }
  return remainder;
}

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
