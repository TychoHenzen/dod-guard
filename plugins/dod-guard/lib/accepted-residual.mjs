// A residual is a finding that a criterion's own text excepts and that another
// open issue takes over. Refinement opts a planned row in with acceptsResiduals,
// and the owner overrules that by replying on the issue. The observed row then
// names the issues it defers to in deferredTo. Such a row stays pass, so the
// issue body is never edited and the rows still to prove are unchanged.
import { presentFields } from "./handoff-values.mjs";

const RESIDUAL_FIELDS = Object.freeze(["acceptsResiduals", "deferredTo"]);

// ASSUMPTION: the proofs read saved files and make no GitHub call, so a deferral
// is checked for shape only, never for an open issue.
function isIssueList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => Number.isInteger(item) && item > 0);
}

function residualFields(row) {
  return presentFields(row ?? {}, RESIDUAL_FIELDS);
}

function plannedResidualErrors(row, label) {
  if (row.acceptsResiduals === undefined || row.acceptsResiduals === true) {
    return [];
  }
  return [`${label} acceptsResiduals must be true when present`];
}

function observedResidualErrors(row, label) {
  if (row.deferredTo === undefined) {
    return [];
  }
  if (!isIssueList(row.deferredTo)) {
    return [`${label} deferredTo must be a non-empty list of issue numbers`];
  }
  const errors = [];
  if (row.status !== "pass") {
    errors.push(`${label} defers residuals, so its status must be pass`);
  }
  if (row.acceptsResiduals !== true) {
    errors.push(`${label} defers residuals, but its planned row does not accept them`);
  }
  return errors;
}

export { observedResidualErrors, plannedResidualErrors, residualFields };
