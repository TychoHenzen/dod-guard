import assert from "node:assert/strict";
import test from "node:test";
import { applyClosures } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";
import {
  chainSnapshot,
  closedWithoutEvidence,
  fakeGitHub,
  holdOf,
  mutating,
  recordedSnapshot,
  snapshotAfter,
} from "./closure.test-support.mjs";

test("closes #683 once every sub-issue is superseded by a verified root", () => {
  const plan = planClosures(recordedSnapshot());
  assert.deepEqual(plan.closes.map(({ issue, rule }) => [issue, rule]), [
    [775, "replaced-original"],
    [776, "replaced-original"],
    [777, "replaced-original"],
    [778, "replaced-original"],
    [683, "parent"],
  ]);
  const parent = plan.closes.at(-1);
  assert.equal(parent.stateReason, "completed");
  assert.deepEqual(parent.children, [775, 776, 777, 778]);
  assert.match(parent.comment, /superseded by a verified root: #775, #776, #777, #778\./);
  assert.deepEqual(plan.holds, []);
  assert.deepEqual(plan.reports, []);
});

test("keeps #683 open with the reason when a sub-issue is not settled", () => {
  const cases = [
    [{ roots: [818, 820, 840] }, "child #778 is open"],
    [{ record: { 841: { pendingRows: ["AC-11"] } } }, "child #778 held: root #841 merged-pending: acceptance rows pending: AC-11"],
    [{ uncheckedOwn: true }, "unchecked acceptance criterion not mapped to a sub-issue: Publish the migration note"],
  ];
  for (const [options, reason] of cases) {
    const plan = planClosures(recordedSnapshot(options));
    assert.ok(!plan.closes.some(({ issue }) => issue === 683), reason);
    assert.deepEqual(holdOf(plan, 683).reasons, [reason]);
  }
});

test("the parent walk stops after five levels", () => {
  const plan = planClosures(chainSnapshot(7));
  assert.deepEqual(plan.closes.map(({ issue }) => issue), [777, 2001, 2002, 2003, 2004, 2005]);
  assert.deepEqual(holdOf(plan, 2006).reasons, ["parent walk stopped after 5 levels"]);
  assert.equal(holdOf(plan, 2007), undefined);
});

test("reports closed and Done records without verified evidence and plans no write for them", () => {
  const plan = planClosures(closedWithoutEvidence());
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(plan.reports, [
    { issue: 831, kind: "unverified-closed", missing: ["completion evidence missing"] },
    { issue: 832, kind: "unverified-closed", missing: ["completion evidence missing"] },
    { issue: 833, kind: "unverified-closed", missing: ["completion evidence missing"] },
  ]);
  const pending = planClosures(closedWithoutEvidence({ record833: { pendingRows: ["AC-15"] } }));
  assert.deepEqual(pending.reports.find(({ issue }) => issue === 833).missing, [
    "merged-pending: acceptance rows pending: AC-15",
  ]);
  const github = fakeGitHub(closedWithoutEvidence());
  assert.deepEqual(applyClosures(closedWithoutEvidence(), { runner: github.runner }).applied, []);
  assert.deepEqual(github.calls.filter(mutating), []);
});

test("a close this helper made stays verified on the next run", () => {
  const snapshot = recordedSnapshot();
  const github = fakeGitHub(snapshot);
  applyClosures(snapshot, { runner: github.runner });
  const after = snapshotAfter(snapshot, github);
  const rerun = planClosures(after);
  assert.deepEqual(rerun.closes, []);
  assert.deepEqual(rerun.holds, []);
  assert.deepEqual(rerun.reports, []);
});

test("holds a parent whose sub-issue list was not read", () => {
  const snapshot = recordedSnapshot();
  const parent = snapshot.issues.find(({ number }) => number === 683);
  delete parent.children;
  const plan = planClosures(snapshot);
  assert.deepEqual(plan.closes.map(({ issue, rule }) => [issue, rule]), [
    [775, "replaced-original"],
    [776, "replaced-original"],
    [777, "replaced-original"],
    [778, "replaced-original"],
  ]);
  assert.deepEqual(holdOf(plan, 683).reasons, ["sub-issue list missing"]);
});

test("a root without its sub-issue list does not verify", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const root = snapshot.issues.find(({ number }) => number === 840);
  delete root.children;
  const plan = planClosures(snapshot);
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(holdOf(plan, 777).reasons, ["root #840 unverified: sub-issue list missing"]);
});
