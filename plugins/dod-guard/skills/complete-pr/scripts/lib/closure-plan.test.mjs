import assert from "node:assert/strict";
import test from "node:test";
import { planClosures } from "./closure-plan.mjs";
import { DELIVERIES, recordedSnapshot } from "./closure.test-support.mjs";

function closeOf(plan, issue) {
  return plan.closes.find((close) => close.issue === issue);
}

function holdOf(plan, issue) {
  return plan.holds.find((hold) => hold.issue === issue);
}

test("closes the original a verified root supersedes", () => {
  const plan = planClosures(recordedSnapshot({ roots: [840] }));
  const close = closeOf(plan, 777);
  assert.equal(close.stateReason, "completed");
  assert.equal(close.rule, "replaced-original");
  assert.equal(close.root, 840);
  assert.equal(close.pullRequest, DELIVERIES[840].pull);
  assert.equal(close.mergeCommit, DELIVERIES[840].merge);
  assert.equal(close.itemId, "PVTI_777");
  assert.match(close.comment, /<!-- dod-guard-closure-evidence -->/);
  assert.match(close.comment, new RegExp(`Superseded by #840, delivered by pull request #901 at merge commit ${DELIVERIES[840].merge}`));
  assert.equal(holdOf(plan, 777), undefined);
  assert.deepEqual(plan.deliveries, [
    { root: 840, status: "verified", pullRequest: 901, mergeCommit: DELIVERIES[840].merge, reasons: [] },
  ]);
});

test("never closes on missing, pending, or mismatched evidence", () => {
  const cases = [
    [{ record: { 840: null } }, "root #840 unverified: completion evidence missing"],
    [{ record: { 840: { pendingRows: ["AC-11"] } } }, "root #840 merged-pending: acceptance rows pending: AC-11"],
    [{ record: { 840: { trustedHeadSha: "f".repeat(40) } } }, "root #840 unverified: trusted head differs from live readback"],
    [{ record: { 840: { mergeCommit: "e".repeat(40) } } }, "root #840 unverified: merge commit differs from live readback"],
    [{ pull: { 840: { checks: "pending" } } }, "root #840 unverified: required checks are incomplete or failed"],
    [{ pull: { 840: { base: "develop" } } }, "root #840 unverified: pull request base is not the default branch"],
  ];
  for (const [options, reason] of cases) {
    const plan = planClosures(recordedSnapshot({ roots: [840], ...options }));
    assert.equal(closeOf(plan, 777), undefined, reason);
    assert.ok(holdOf(plan, 777).reasons.includes(reason), `${reason} in ${JSON.stringify(plan.holds)}`);
  }
});

test("holds the root that carries an unusable supersedes record", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const root = snapshot.issues.find(({ number }) => number === 840);
  root.body = root.body.replace("[777]", '["Other/repo#777"]');
  const plan = planClosures(snapshot);
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(holdOf(plan, 840).reasons, ["supersedes record names cross-repository issue Other/repo#777"]);
});

test("holds an original that two roots supersede", () => {
  const snapshot = recordedSnapshot({ roots: [840, 841] });
  const root = snapshot.issues.find(({ number }) => number === 841);
  root.body = root.body.replace("[778]", "[777, 778]");
  const plan = planClosures(snapshot);
  assert.equal(closeOf(plan, 777), undefined);
  assert.deepEqual(holdOf(plan, 777).reasons, ["superseded by more than one root: #840, #841"]);
});
