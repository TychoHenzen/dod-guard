import { evaluateConvergence } from "../../next-ticket/scripts/structured-workflow-proof.mjs";
import {
  ACCEPTANCE_MATRIX_PATHS,
  validateAcceptanceMatrix,
} from "../../goal-sdlc/scripts/lib/acceptance-matrix.mjs";

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
    if (values(value).length === 0) {
      return { error: `${label} is not mapped in the acceptance matrix`, rows: [] };
    }
    const rows = [];
    const seenReferences = new Set();
    for (const reference of values(value)) {
      if (seenReferences.has(reference)) {
        return { error: `${label} references ${reference} more than once`, rows };
      }
      seenReferences.add(reference);
      const matches = matrix.filter((row) => text(row?.[field]) === reference);
      if (matches.length === 0) {
        return { error: `${label} ${reference} is not mapped in the acceptance matrix`, rows };
      }
      if (matches.length > 1) {
        return { error: `${label} ${reference} is mapped to multiple acceptance-matrix rows`, rows };
      }
      if (text(matches[0]?.headSha) !== expectedHead) {
        return {
          error: `${label} ${reference} is bound to ${text(matches[0]?.headSha) ?? "no head"}, expected ${expectedHead}`,
          rows,
        };
      }
      if (text(matches[0]?.status)?.toLowerCase() !== "pass") {
        return {
          error: `${label} ${reference} is bound to non-passing status ${text(matches[0]?.status) ?? "no status"}`,
          rows,
        };
      }
      rows.push(matches[0]);
    }
    return { error: null, rows };
  };
  const tasks = Array.isArray(handoff.tasks) ? handoff.tasks : [];
  const matrixValidation = validateAcceptanceMatrix({
    matrix,
    headSha: expectedHead,
    requiredPaths: ACCEPTANCE_MATRIX_PATHS,
  });
  const remainder = matrixValidation.errors.map((error) => `acceptance matrix: ${error}`);
  for (const lens of Array.isArray(handoff.reviewLenses) ? handoff.reviewLenses : []) {
    const id = text(lens?.id ?? lens?.name) ?? "review lens";
    if (text(lens?.headSha ?? lens?.head) !== expectedHead) {
      remainder.push(`${id} review lens is not bound to handoff head ${expectedHead}`);
    }
    const owner = text(lens?.owner);
    const ownerTask = tasks.find((task) => text(task?.id) === owner)
      ?? tasks.find((task) => text(task?.child) === owner);
    if (!ownerTask) {
      remainder.push(`${id} review lens references missing owner ${owner ?? "<missing>"}`);
      continue;
    }
    const ownerAcceptance = values(ownerTask?.acceptanceEvidence);
    const ownerVerification = values(ownerTask?.verificationEvidence);
    const lensAcceptance = values(lens?.acceptanceEvidence);
    const lensVerification = values(lens?.verificationEvidence);
    if (
      ownerAcceptance.length === 0
      || lensAcceptance.length === 0
      || !lensAcceptance.every((evidence) => ownerAcceptance.includes(evidence))
    ) {
      remainder.push(`${id} owner task needs mapped acceptance evidence`);
    }
    if (
      ownerVerification.length === 0
      || lensVerification.length === 0
      || !lensVerification.every((evidence) => ownerVerification.includes(evidence))
    ) {
      remainder.push(`${id} owner task needs mapped verification evidence`);
    }
    const verificationRemainder = matrixReference(
      "proof",
      lens?.verificationEvidence,
      `${id} review lens verification evidence`,
    );
    if (verificationRemainder.error) remainder.push(verificationRemainder.error);
    const acceptanceRemainder = matrixReference(
      "evidence",
      lens?.acceptanceEvidence,
      `${id} review lens acceptance evidence`,
    );
    if (acceptanceRemainder.error) remainder.push(acceptanceRemainder.error);
    if (
      !verificationRemainder.error
      && !acceptanceRemainder.error
      && (
        acceptanceRemainder.rows.length !== verificationRemainder.rows.length
        || acceptanceRemainder.rows.some((row, index) => row !== verificationRemainder.rows[index])
      )
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
