import { ACCEPTANCE_MATRIX_STATUSES, observedStatusErrors } from "./matrix-observed-status.mjs";

// Refinement plans each row before any proof runs, so a planned row has no
// observed result or head yet and is either still to prove or ruled out.
const ACCEPTANCE_MATRIX_PLANNED_STATUSES = Object.freeze(["pending", "inapplicable"]);

const ACCEPTANCE_MATRIX_PATHS = Object.freeze([
  "identity/authorization",
  "interactive-control",
  "browser/e2e",
  "data/error",
  "recovery",
]);

const ACCEPTANCE_MATRIX_FIELDS = Object.freeze([
  "id",
  "contract",
  "path",
  "proof",
  "expected",
  "observed",
  "status",
  "evidence",
  "headSha",
]);

const FIELD_ALIASES = Object.freeze({
  id: ["id", "criterionId"],
  contract: ["contract", "criterion", "acceptanceCriterion"],
  path: ["path", "risk", "riskOrPath", "userPath"],
  proof: ["proof", "proofAction", "step"],
  expected: ["expected", "expectedObservable"],
  observed: ["observed", "observedResult"],
  status: ["status"],
  evidence: ["evidence", "evidenceLocation"],
  headSha: ["headSha", "exactHeadSha", "head"],
});

const PATH_ALIASES = Object.freeze({
  "identity/authorization": ["identity", "authorization", "auth", "eligibility"],
  "interactive-control": ["interactive", "control", "zoom", "pan"],
  "browser/e2e": ["browser", "e2e", "end-to-end", "behavioral"],
  "data/error": ["data", "error", "boundary"],
  recovery: ["recovery", "retry", "fallback"],
});

function textValue(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function fieldValue(row, field) {
  for (const alias of FIELD_ALIASES[field]) {
    const value = textValue(row?.[alias]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function normalizeStatus(status) {
  const normalized = status.toLowerCase();
  if (normalized === "not-applicable") {
    return "inapplicable";
  }
  return normalized;
}

function normalizePath(path) {
  return path.toLowerCase().replace(/\s+/g, " ").trim();
}

function pathMatches(path, requiredPath) {
  const normalized = normalizePath(path);
  if (normalized.includes(requiredPath)) {
    return true;
  }
  return (PATH_ALIASES[requiredPath] ?? []).some((alias) => normalized.includes(alias));
}

function contractName(value) {
  if (typeof value === "string") {
    return textValue(value);
  }
  return fieldValue(value, "id") ?? fieldValue(value, "contract");
}

function matrixRows(matrix) {
  if (Array.isArray(matrix)) {
    return matrix;
  }
  if (Array.isArray(matrix?.rows)) {
    return matrix.rows;
  }
  return null;
}

// The optional carryForward record is not an acceptance field, so it is kept
// only when the row supplies one and rows without it normalize as before.
function carryForwardField(row) {
  if (Object.hasOwn(row ?? {}, "carryForward")) {
    return { carryForward: row.carryForward };
  }
  return {};
}

function normalizeRow(row, index) {
  const normalized = Object.fromEntries(ACCEPTANCE_MATRIX_FIELDS.map((field) => [field, fieldValue(row, field)]));
  normalized.index = index;
  normalized.reason = textValue(row?.reason) ?? textValue(row?.inapplicableReason);
  Object.assign(normalized, carryForwardField(row));
  if (normalized.status !== null) {
    normalized.status = normalizeStatus(normalized.status);
  }
  return normalized;
}

function missingFieldErrors(row, label, requiredFields) {
  return requiredFields.filter((field) => row[field] === null).map((field) => `${label} is missing ${field}`);
}

function unplannedStatusErrors(row, label) {
  if (ACCEPTANCE_MATRIX_STATUSES.includes(row.status)) {
    return [`${label} has status ${row.status}, which is not a planned status`];
  }
  return [`${label} has unsupported status ${row.status}`];
}

function plannedStatusErrors(row, label) {
  const planned = row.status === null || ACCEPTANCE_MATRIX_PLANNED_STATUSES.includes(row.status);
  if (!planned) {
    return unplannedStatusErrors(row, label);
  }
  if (row.status === "inapplicable" && row.reason === null) {
    return [`${label} marked inapplicable without an explicit reason`];
  }
  return [];
}

// Observed rows carry proof results bound to a pushed head. Planned rows come
// from refinement, before any proof or head exists, so they need neither and
// each criterion needs a row still to prove rather than one already passing.
const MATRIX_MODES = Object.freeze({
  observed: Object.freeze({
    requiredFields: ACCEPTANCE_MATRIX_FIELDS.slice(1),
    statusErrors: observedStatusErrors,
    contractStatus: "pass",
    contractLabel: "passing",
    needsHead: true,
  }),
  planned: Object.freeze({
    requiredFields: ACCEPTANCE_MATRIX_FIELDS.slice(1).filter((field) => field !== "observed" && field !== "headSha"),
    statusErrors: plannedStatusErrors,
    contractStatus: "pending",
    contractLabel: "pending",
    needsHead: false,
  }),
});

function matrixMode(mode) {
  if (!Object.hasOwn(MATRIX_MODES, mode)) {
    throw new TypeError(`unknown acceptance matrix mode ${mode}`);
  }
  return MATRIX_MODES[mode];
}

function idErrors(row, label, seenIds) {
  if (row.id === null) {
    return [`${label} is missing id`];
  }
  const duplicate = seenIds.has(row.id);
  seenIds.add(row.id);
  if (duplicate) {
    return [`${label} duplicates an earlier id`];
  }
  return [];
}

function rowErrors(row, { expectedHeadSha, seenIds, mode }) {
  const label = row.id ?? `row ${row.index + 1}`;
  return [
    ...idErrors(row, label, seenIds),
    ...missingFieldErrors(row, label, mode.requiredFields),
    ...mode.statusErrors(row, label, expectedHeadSha),
  ];
}

function contractErrors(rows, requiredContracts, mode) {
  return requiredContracts
    .map(contractName)
    .filter(Boolean)
    .filter(
      (contract) =>
        !rows.some((row) => (row.id === contract || row.contract === contract) && row.status === mode.contractStatus),
    )
    .map((contract) => `missing ${mode.contractLabel} acceptance row for ${contract}`);
}

function canTake(row, requiredPath, seenRows) {
  return row.path !== null && pathMatches(row.path, requiredPath) && !seenRows.has(row.index);
}

function pathErrors(rows, requiredPaths) {
  const matchedRows = new Map();
  const takeRow = (row, requiredPath, seenRows) => {
    seenRows.add(row.index);
    const assignedPath = matchedRows.get(row.index);
    if (assignedPath === undefined || assignRow(assignedPath, seenRows)) {
      matchedRows.set(row.index, requiredPath);
      return true;
    }
    return false;
  };
  const assignRow = (requiredPath, seenRows) =>
    rows.some((row) => canTake(row, requiredPath, seenRows) && takeRow(row, requiredPath, seenRows));

  return requiredPaths
    .filter((requiredPath) => !assignRow(requiredPath, new Set()))
    .map((requiredPath) => `missing acceptance row for ${requiredPath}`);
}

function expectedHead(mode, headSha) {
  if (mode.needsHead) {
    return textValue(headSha);
  }
  return null;
}

function validateRows(rows, expectedHeadSha, mode) {
  const errors = [];
  const seenIds = new Set();
  for (const row of rows) {
    errors.push(...rowErrors(row, { expectedHeadSha, seenIds, mode }));
  }
  return errors;
}

// mode "observed" (the default) checks a handoff matrix after push; mode
// "planned" checks the refinement matrix of the issue body before push.
function validateAcceptanceMatrix({
  matrix,
  headSha,
  requiredContracts = [],
  requiredPaths = ACCEPTANCE_MATRIX_PATHS,
  mode: modeName = "observed",
} = {}) {
  const mode = matrixMode(modeName);
  const errors = [];
  const rows = matrixRows(matrix);
  const expectedHeadSha = expectedHead(mode, headSha);
  const normalizedRows = [];
  if (rows !== null) {
    normalizedRows.push(...rows.map(normalizeRow));
  }

  if (rows === null || rows.length === 0) {
    errors.push("acceptance matrix needs one row per contract or required user path");
  }
  if (mode.needsHead && expectedHeadSha === null) {
    errors.push("acceptance matrix needs an independently fetched current pushed head SHA");
  }

  errors.push(...validateRows(normalizedRows, expectedHeadSha, mode));
  errors.push(...contractErrors(normalizedRows, requiredContracts, mode));
  errors.push(...pathErrors(normalizedRows, requiredPaths));

  return {
    valid: errors.length === 0,
    errors,
    rows: normalizedRows,
    headSha: expectedHeadSha,
  };
}

export { ACCEPTANCE_MATRIX_STATUSES } from "./matrix-observed-status.mjs";
export { ACCEPTANCE_MATRIX_FIELDS, ACCEPTANCE_MATRIX_PATHS, validateAcceptanceMatrix };
