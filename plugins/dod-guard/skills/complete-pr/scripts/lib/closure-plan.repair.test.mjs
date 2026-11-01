// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { issue, item, recordedSnapshot } from "./closure.test-support.mjs";
import { planClosures } from "./closure-plan.mjs";

const HAND_CLOSED_ISSUE = 2001;
const REPLACED_ORIGINAL = 777;
const SUPERSEDES_ROOT = 840;
const STATE_REASON = "state_reason";

function closeOf(plan, issueNumber) {
  return plan.closes.find((close) => close.issue === issueNumber);
}

function notPlanned() {
  return { state: "closed", [STATE_REASON]: "not_planned" };
}

function originalOf(snapshot) {
  return snapshot.issues.find(({ number }) => number === REPLACED_ORIGINAL);
}

// An owner's hand close shaped like disc-golf #60: closed with the given reason, with no supersedes
// root, completion record or closure comment, on a Project item that has the given status.
function handClosedItem(stateReason, status) {
  const snapshot = recordedSnapshot();
  snapshot.items.push(item(HAND_CLOSED_ISSUE, status));
  snapshot.issues.push(Object.assign(issue(HAND_CLOSED_ISSUE), { state: "closed", [STATE_REASON]: stateReason }));
  return snapshot;
}

test("a not_planned hand close whose Project item is not Done gets a Done repair", () => {
  for (const status of ["Backlog", "In Progress"]) {
    const plan = planClosures(handClosedItem("not_planned", status));
    assert.deepEqual(plan.statusRepairs, [
      { issue: HAND_CLOSED_ISSUE, itemId: "PVTI_2001", status, stateReason: "not_planned" },
    ]);
    assert.equal(closeOf(plan, HAND_CLOSED_ISSUE), undefined);
  }
});

test("a Done not_planned item and a completed hand close get no repair", () => {
  assert.deepEqual(planClosures(handClosedItem("not_planned", "Done")).statusRepairs, []);
  assert.deepEqual(planClosures(handClosedItem("completed", "Backlog")).statusRepairs, []);
});

test("a not_planned original that a root names also gets a Done repair", () => {
  const snapshot = recordedSnapshot({ roots: [SUPERSEDES_ROOT] });
  Object.assign(originalOf(snapshot), notPlanned());
  assert.deepEqual(planClosures(snapshot).statusRepairs, [
    { issue: REPLACED_ORIGINAL, itemId: "PVTI_777", status: "Backlog", stateReason: "not_planned" },
  ]);
});

test("a not_planned original named by an unverified root gets a Done repair and keeps its report", () => {
  const snapshot = recordedSnapshot({ roots: [SUPERSEDES_ROOT], record: { [SUPERSEDES_ROOT]: null } });
  Object.assign(originalOf(snapshot), notPlanned());
  const plan = planClosures(snapshot);
  assert.deepEqual(plan.statusRepairs, [
    { issue: REPLACED_ORIGINAL, itemId: "PVTI_777", status: "Backlog", stateReason: "not_planned" },
  ]);
  assert.equal(plan.reports.find((report) => report.issue === REPLACED_ORIGINAL)?.kind, "unverified-closed");
});
