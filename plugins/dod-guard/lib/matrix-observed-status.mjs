import { carryForwardErrors } from "./carry-forward-record.mjs";

const ACCEPTANCE_MATRIX_STATUSES = Object.freeze(["pass", "unverified", "failed", "blocked", "inapplicable"]);

function unsupportedStatusErrors(row, label) {
  if (row.status !== null && !ACCEPTANCE_MATRIX_STATUSES.includes(row.status)) {
    return [`${label} has unsupported status ${row.status}`];
  }
  return [];
}

function staleHeadErrors(row, label, expectedHeadSha) {
  const stale = row.headSha !== null && expectedHeadSha !== null && row.headSha !== expectedHeadSha;
  if (stale) {
    return [`${label} is bound to head ${row.headSha}, expected ${expectedHeadSha}`];
  }
  return [];
}

function inapplicableReasonErrors(row, label) {
  if (row.status === "inapplicable" && row.reason === null) {
    return [`${label} marked inapplicable without an explicit reason`];
  }
  return [];
}

function nonPassingStatusErrors(row, label) {
  if (row.status !== null && row.status !== "pass" && row.status !== "inapplicable") {
    return [`${label} has non-passing status ${row.status}`];
  }
  return [];
}

function observedStatusErrors(row, label, expectedHeadSha) {
  return [
    ...unsupportedStatusErrors(row, label),
    ...staleHeadErrors(row, label, expectedHeadSha),
    ...carryForwardErrors(row, label),
    ...inapplicableReasonErrors(row, label),
    ...nonPassingStatusErrors(row, label),
  ];
}

export { ACCEPTANCE_MATRIX_STATUSES, observedStatusErrors };
