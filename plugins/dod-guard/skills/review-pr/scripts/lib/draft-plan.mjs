import { requireEntryShape, requireQuestion } from "./plan-entry.mjs";

// A status is saved after verification, so a draft plan may lack one. An absent
// status takes a valid value here; a saved one is judged as written.
function withStatus(question) {
  return { ...question, status: question.status ?? "verified" };
}

// The shape check that runs before any investigator, so a malformed plan fails
// while it is still cheap to redo.
function requireDraftPlan(plan) {
  const ids = new Set();
  for (const entry of plan) {
    requireEntryShape(entry);
    for (const question of entry.questions ?? []) {
      requireQuestion(withStatus(question), entry.slot, ids);
    }
  }
}

export { requireDraftPlan };
