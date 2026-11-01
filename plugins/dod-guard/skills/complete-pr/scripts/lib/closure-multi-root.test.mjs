// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { holdOf, item, recordedSnapshot, supersedesBody } from "./closure.test-support.mjs";
import { planClosures } from "./closure-plan.mjs";

// The shape: epic #683 with sub-issues #775 and #776 (open, replaced by verified roots #818 and #820)
// and #777 (closed as not_planned and Done), which roots #840 and #841 both name in their supersedes
// records. options.undelivered withholds #841's completion record.
function multiRootChild({ undelivered = false } = {}) {
  const snapshot = recordedSnapshot({ roots: [818, 820], record: undelivered ? { 841: null } : {} });
  const kept = (number) => number !== 778;
  snapshot.items = snapshot.items.filter(({ content }) => kept(content.number));
  snapshot.issues = snapshot.issues.filter(({ number }) => kept(number));
  const epic = snapshot.issues.find(({ number }) => number === 683);
  epic.children = epic.children.filter(({ number }) => kept(number));
  epic.body = "## Acceptance criteria\n\n- [ ] One (#775)\n- [ ] Two (#776)\n- [ ] Three (#777)\n";
  for (const root of [840, 841]) {
    snapshot.issues.find(({ number }) => number === root).body = supersedesBody([777]);
  }
  const child = snapshot.issues.find(({ number }) => number === 777);
  Object.assign(child, { state: "closed", state_reason: "not_planned" });
  snapshot.items = snapshot.items.map((entry) =>
    entry.content.number === 777 ? item(777, "Done", { parent: 683 }) : entry,
  );
  return snapshot;
}

test("a not_planned child named by several delivered roots lets the parent close", () => {
  const plan = planClosures(multiRootChild());
  assert.equal(plan.closes.find(({ issue }) => issue === 683)?.rule, "parent");
  assert.deepEqual(plan.holds, []);
  assert.deepEqual(plan.reports, []);
});

test("a not_planned child with one undelivered root still holds the parent and names that root", () => {
  const plan = planClosures(multiRootChild({ undelivered: true }));
  assert.equal(
    plan.closes.some(({ issue }) => issue === 683),
    false,
  );
  assert.deepEqual(holdOf(plan, 683).reasons, [
    "child #777 closed without verified evidence: root #841 unverified: completion evidence missing",
  ]);
  assert.deepEqual(plan.reports.find(({ issue }) => issue === 777).missing, [
    "root #841 unverified: completion evidence missing",
  ]);
});
