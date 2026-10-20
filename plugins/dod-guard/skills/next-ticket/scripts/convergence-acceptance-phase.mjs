import { ACCEPTANCE_MATRIX_PATHS, validateAcceptanceMatrix } from "../../../lib/acceptance-matrix.mjs";
import { declareEvidence, evidenceValues, normalizedIdentifier } from "./convergence-core.mjs";
import { lensRowRemainder } from "./convergence-lens-rows.mjs";
import { LENS_ROW_KINDS } from "./convergence-row-resolve.mjs";

const ACCEPTANCE = "Acceptance and verification";
const FUNCTIONAL = "Functional decomposition";

// Every matrix row must be unique and owned by a task or review lens.
function kindOwnershipErrors({ rows, kind, owners }) {
  const declared = new Set(owners.flatMap((owner) => evidenceValues(owner[kind.lensField])));
  const seen = new Set();
  const errors = [];
  for (const value of rows.map((row) => row[kind.rowField]).filter(Boolean)) {
    if (seen.has(value)) {
      errors.push(`acceptance matrix ${kind.label} ${value} is declared more than once`);
    }
    seen.add(value);
    if (!declared.has(value)) {
      errors.push(`acceptance matrix ${kind.label} ${value} is not owned by a task or review lens`);
    }
  }
  return errors;
}

function matrixOwnershipErrors(rows, taskList, lensList) {
  const owners = [...taskList, ...lensList];
  return LENS_ROW_KINDS.flatMap((kind) => kindOwnershipErrors({ rows, kind, owners }));
}

function activeMatrix({ postPushValidation, acceptanceMatrix, plannedAcceptanceMatrix }) {
  if (postPushValidation) {
    return { mode: "observed", matrix: acceptanceMatrix };
  }
  if (plannedAcceptanceMatrix !== null && plannedAcceptanceMatrix !== undefined) {
    return { mode: "planned", matrix: plannedAcceptanceMatrix };
  }
  return null;
}

function validateMatrixPhase({
  active,
  expectedHeadSha,
  acceptanceList,
  taskList,
  lensList,
  ownedLenses,
  addRemainder,
}) {
  const validation = validateAcceptanceMatrix({
    matrix: active.matrix,
    headSha: expectedHeadSha,
    requiredContracts: acceptanceList,
    requiredPaths: ACCEPTANCE_MATRIX_PATHS,
    mode: active.mode,
  });
  for (const error of validation.errors) {
    addRemainder(ACCEPTANCE, `acceptance matrix: ${error}`);
  }
  for (const error of matrixOwnershipErrors(validation.rows, taskList, lensList)) {
    addRemainder(ACCEPTANCE, error);
  }
  const observed = active.mode === "observed";
  for (const error of lensRowRemainder({ ownedLenses, rows: validation.rows, observed, expectedHeadSha })) {
    addRemainder(FUNCTIONAL, error);
  }
}

function declareCriterion({ criterion, index, seenAcceptanceIds, evidenceOwners, addRemainder }) {
  const criterionId = normalizedIdentifier(criterion.id);
  if (!criterionId) {
    addRemainder(ACCEPTANCE, `acceptance criterion ${index + 1} needs a non-empty id`);
    return;
  }
  if (seenAcceptanceIds.has(criterionId)) {
    addRemainder(ACCEPTANCE, `${criterionId} acceptance criterion is declared more than once`);
    return;
  }
  seenAcceptanceIds.add(criterionId);
  if (evidenceValues(criterion.evidence).length === 0) {
    addRemainder(ACCEPTANCE, `${criterionId} needs fresh evidence`);
    return;
  }
  declareEvidence({
    owner: criterionId,
    value: criterion.evidence,
    section: ACCEPTANCE,
    evidenceOwners,
    addRemainder,
  });
}

function declareCriteria({ acceptanceList, evidenceOwners, addRemainder }) {
  const seenAcceptanceIds = new Set();
  for (const [index, criterion] of acceptanceList.entries()) {
    declareCriterion({ criterion, index, seenAcceptanceIds, evidenceOwners, addRemainder });
  }
}

// Runs the criteria loop, then the matrix phase when a matrix is active. After
// push the observed matrix is checked at the exact head. Before push a planned
// matrix, when supplied, gets the same lens-row rules without the status and
// head checks. With neither, the matrix and lens-row checks wait.
export function acceptancePhase({
  acceptanceList,
  evidenceOwners,
  taskList,
  lensList,
  ownedLenses,
  matrixInput,
  addRemainder,
}) {
  declareCriteria({ acceptanceList, evidenceOwners, addRemainder });
  const active = activeMatrix(matrixInput);
  if (active) {
    validateMatrixPhase({
      active,
      expectedHeadSha: matrixInput.expectedHeadSha,
      acceptanceList,
      taskList,
      lensList,
      ownedLenses,
      addRemainder,
    });
  }
}
