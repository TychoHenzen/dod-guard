import { evidenceValues } from "./convergence-core.mjs";

// A lens names its rows twice, by evidence and by proof; both must resolve to
// the same rows.
const LENS_ROW_KINDS = Object.freeze([
  Object.freeze({ name: "acceptance", lensField: "acceptanceEvidence", rowField: "evidence", label: "evidence" }),
  Object.freeze({ name: "verification", lensField: "verificationEvidence", rowField: "proof", label: "proof" }),
]);

function headMismatch({ row, label, expectedHeadSha }) {
  if (!expectedHeadSha || row.headSha === expectedHeadSha) {
    return null;
  }
  return `${label} is bound to ${row.headSha ?? "no head"}, expected ${expectedHeadSha}`;
}

function isPassingStatus(row) {
  if (row.status === "pass") {
    return true;
  }
  return row.status === "inapplicable" && Boolean(row.reason);
}

function statusProblem({ row, label }) {
  if (isPassingStatus(row)) {
    return null;
  }
  return `${label} is bound to non-passing status ${row.status ?? "no status"}`;
}

function matchCountError({ id, kind, reference, matches }) {
  if (matches.length === 0) {
    return `${id} review lens references undeclared ${kind.name} evidence ${reference}`;
  }
  if (matches.length > 1) {
    return `${id} review lens ${kind.name} evidence ${reference} is mapped to multiple acceptance-matrix rows`;
  }
  return null;
}

function lensRowError({ id, kind, reference, matches, observed, expectedHeadSha }) {
  const countError = matchCountError({ id, kind, reference, matches });
  if (countError) {
    return countError;
  }
  if (!observed) {
    return null;
  }
  const label = `${id} review lens ${kind.name} evidence ${reference}`;
  return headMismatch({ row: matches[0], label, expectedHeadSha }) ?? statusProblem({ row: matches[0], label });
}

// Resolves one lens reference to its matrix row. Returns { error } for a
// repeated or unresolvable reference and { row } otherwise.
function resolveReference({ id, kind, reference, seen, rows, observed, expectedHeadSha }) {
  if (seen.has(reference)) {
    return { error: `${id} review lens ${kind.name} evidence references ${reference} more than once` };
  }
  seen.add(reference);
  const matches = rows.filter((row) => row[kind.rowField] === reference);
  const error = lensRowError({ id, kind, reference, matches, observed, expectedHeadSha });
  if (error) {
    return { error };
  }
  return { row: matches[0] };
}

function resolveLensRows({ id, kind, lens, rows, observed, expectedHeadSha }) {
  const errors = [];
  const resolved = [];
  const seen = new Set();
  for (const reference of evidenceValues(lens[kind.lensField])) {
    const result = resolveReference({ id, kind, reference, seen, rows, observed, expectedHeadSha });
    if (result.error) {
      errors.push(result.error);
    }
    if (result.row) {
      resolved.push(result.row);
    }
  }
  return { errors, rows: resolved };
}

function ownerDeclarationErrors({ id, kind, lens, ownerTask }) {
  const declared = evidenceValues(ownerTask[kind.lensField]);
  const missing = evidenceValues(lens[kind.lensField]).filter((reference) => !declared.includes(reference));
  if (missing.length === 0) {
    return [];
  }
  return [`${id} owner task needs mapped ${kind.name} evidence ${missing.join(", ")}`];
}

const rowKey = (row) => row.id ?? `row ${row.index + 1}`;

function sameRows(left, right) {
  const rightIndexes = new Set(right.map((row) => row.index));
  return left.length === rightIndexes.size && left.every((row) => rightIndexes.has(row.index));
}

export { LENS_ROW_KINDS, ownerDeclarationErrors, resolveLensRows, rowKey, sameRows };
