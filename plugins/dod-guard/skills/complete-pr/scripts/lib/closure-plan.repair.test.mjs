import assert from "node:assert/strict";
import test from "node:test";
import { issue, item, recordedSnapshot } from "./closure.test-support.mjs";
import { planClosures } from "./closure-plan.mjs";

function closeOf(plan, issue) {
  return plan.closes.find((close) => close.issue === issue);
}

// An owner's hand close shaped like disc-golf #60: closed with the given reason, with no supersedes
// root, completion record or closure comment, on a Project item that has the given status.
function handClosedItem(stateReason, status) {
  const snapshot = recordedSnapshot();
  snapshot.items.push(item(2001, status));
  snapshot.issues.push(Object.assign(issue(2001), { state: "closed", state_reason: stateReason }));
  return snapshot;
}

test("a not_planned hand close whose Project item is not Done gets a Done repair", () => {
  for (const status of ["Backlog", "In Progress"]) {
    const plan = planClosures(handClosedItem("not_planned", status));
    assert.deepEqual(plan.statusRepairs, [{ issue: 2001, itemId: "PVTI_2001", status, stateReason: "not_planned" }]);
    assert.equal(closeOf(plan, 2001), undefined);
  }
});

test("a Done not_planned item and a completed hand close get no repair", () => {
  assert.deepEqual(planClosures(handClosedItem("not_planned", "Done")).statusRepairs, []);
  assert.deepEqual(planClosures(handClosedItem("completed", "Backlog")).statusRepairs, []);
});

test("a not_planned original that a root names also gets a Done repair", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const original = snapshot.issues.find(({ number }) => number === 777);
  Object.assign(original, { state: "closed", state_reason: "not_planned" });
  assert.deepEqual(planClosures(snapshot).statusRepairs, [
    { issue: 777, itemId: "PVTI_777", status: "Backlog", stateReason: "not_planned" },
  ]);
});

test("a not_planned original named by an unverified root gets a Done repair and keeps its report", () => {
  const snapshot = recordedSnapshot({ roots: [840], record: { 840: null } });
  Object.assign(
    snapshot.issues.find(({ number }) => number === 777),
    { state: "closed", state_reason: "not_planned" },
  );
  const plan = planClosures(snapshot);
  assert.deepEqual(plan.statusRepairs, [
    { issue: 777, itemId: "PVTI_777", status: "Backlog", stateReason: "not_planned" },
  ]);
  assert.equal(plan.reports.find((report) => report.issue === 777)?.kind, "unverified-closed");
});
