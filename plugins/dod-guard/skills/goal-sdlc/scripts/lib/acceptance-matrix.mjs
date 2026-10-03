const ACCEPTANCE_MATRIX_STATUSES = Object.freeze([
  "pass",
  "unverified",
  "failed",
  "blocked",
  "inapplicable",
]);

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

function normalizeRow(row, index) {
  const normalized = Object.fromEntries(
    ACCEPTANCE_MATRIX_FIELDS.map((field) => [field, fieldValue(row, field)]),
  );
  normalized.index = index;
  normalized.reason = textValue(row?.reason) ?? textValue(row?.inapplicableReason);
  if (normalized.status !== null) {
    normalized.status = normalizeStatus(normalized.status);
  }
  return normalized;
}

function missingFieldErrors(row, label) {
  return ACCEPTANCE_MATRIX_FIELDS.slice(1)
    .filter((field) => row[field] === null)
    .map((field) => `${label} is missing ${field}`);
}

function statusErrors(row, label, expectedHeadSha) {
  const errors = [];
  if (row.status !== null && !ACCEPTANCE_MATRIX_STATUSES.includes(row.status)) {
    errors.push(`${label} has unsupported status ${row.status}`);
  }
  if (row.headSha !== null && expectedHeadSha !== null && row.headSha !== expectedHeadSha) {
    errors.push(`${label} is bound to head ${row.headSha}, expected ${expectedHeadSha}`);
  }
  if (row.status === "inapplicable" && row.reason === null) {
    errors.push(`${label} marked inapplicable without an explicit reason`);
  }
  if (row.status !== null && row.status !== "pass" && row.status !== "inapplicable") {
    errors.push(`${label} has non-passing status ${row.status}`);
  }
  return errors;
}

function rowErrors(row, expectedHeadSha, seenIds) {
  const errors = [];
  const label = row.id ?? `row ${row.index + 1}`;
  if (row.id === null) {
    errors.push(`${label} is missing id`);
  }
  if (row.id !== null && seenIds.has(row.id)) {
    errors.push(`${label} duplicates an earlier id`);
  }
  if (row.id !== null) {
    seenIds.add(row.id);
  }
  errors.push(...missingFieldErrors(row, label));
  errors.push(...statusErrors(row, label, expectedHeadSha));
  return errors;
}

function contractErrors(rows, requiredContracts) {
  return requiredContracts
    .map(contractName)
    .filter(Boolean)
    .filter((contract) => !rows.some(
      (row) => (row.id === contract || row.contract === contract) && row.status === "pass",
    ))
    .map((contract) => `missing passing acceptance row for ${contract}`);
}

function pathErrors(rows, requiredPaths) {
  const matchedRows = new Map();
  const assignRow = (requiredPath, seenRows) => {
    for (const row of rows) {
      if (row.path === null || !pathMatches(row.path, requiredPath) || seenRows.has(row.index)) {
        continue;
      }
      seenRows.add(row.index);
      const assignedPath = matchedRows.get(row.index);
      if (assignedPath === undefined || assignRow(assignedPath, seenRows)) {
        matchedRows.set(row.index, requiredPath);
        return true;
      }
    }
    return false;
  };

  return requiredPaths
    .filter((requiredPath) => !assignRow(requiredPath, new Set()))
    .map((requiredPath) => `missing acceptance row for ${requiredPath}`);
}

function validateRows(rows, expectedHeadSha) {
  const errors = [];
  const seenIds = new Set();
  for (const row of rows) {
    errors.push(...rowErrors(row, expectedHeadSha, seenIds));
  }
  return errors;
}

function validateAcceptanceMatrix({
  matrix,
  headSha,
  requiredContracts = [],
  requiredPaths = ACCEPTANCE_MATRIX_PATHS,
} = {}) {
  const errors = [];
  const rows = matrixRows(matrix);
  const expectedHeadSha = textValue(headSha);
  const normalizedRows = [];
  if (rows !== null) {
    normalizedRows.push(...rows.map(normalizeRow));
  }

  if (rows === null || rows.length === 0) {
    errors.push("acceptance matrix needs one row per contract or required user path");
  }
  if (expectedHeadSha === null) {
    errors.push("acceptance matrix needs an independently fetched current pushed head SHA");
  }

  errors.push(...validateRows(normalizedRows, expectedHeadSha));
  errors.push(...contractErrors(normalizedRows, requiredContracts));
  errors.push(...pathErrors(normalizedRows, requiredPaths));

  return {
    valid: errors.length === 0,
    errors,
    rows: normalizedRows,
    headSha: expectedHeadSha,
  };
}

export {
  ACCEPTANCE_MATRIX_FIELDS,
  ACCEPTANCE_MATRIX_PATHS,
  ACCEPTANCE_MATRIX_STATUSES,
  validateAcceptanceMatrix,
};
