// Tests for the judgement a legacy completion record gets: the same delivery rules as any other record,
// so a moved merge commit, a moved head, or a missing record is never verified.
// biome-ignore-all lint/correctness/noNodejsModules: node:test and node:assert are the test harness
import assert from "node:assert/strict";
import { test } from "node:test";
import { indexSnapshot } from "../../../../lib/closure-index.mjs";
import { DELIVERIES, recordedSnapshot } from "./closure.test-support.mjs";
import { judgeDelivery } from "./closure-delivery.mjs";

const LEGACY = 818;
const SHA_LENGTH = 40;
const OTHER = "e".repeat(SHA_LENGTH);

function judged(snapshot) {
  return judgeDelivery(indexSnapshot(snapshot), LEGACY);
}

function legacySnapshot() {
  return recordedSnapshot({ record: { [LEGACY]: { legacy: true } } });
}

function legacyPull(snapshot) {
  return snapshot.pullRequests.find(({ number }) => number === DELIVERIES[LEGACY].pull);
}

test("a legacy record is verified when the live pull request matches", () => {
  const verdict = judged(legacySnapshot());
  assert.equal(verdict.status, "verified");
  assert.equal(verdict.record.legacy, true);
});

test("a legacy record is unverified when only the merge commit moved", () => {
  const snapshot = legacySnapshot();
  legacyPull(snapshot).mergeCommit.oid = OTHER;
  const verdict = judged(snapshot);
  assert.equal(verdict.status, "unverified");
  assert.deepEqual(verdict.reasons, ["merge commit differs from live readback"]);
});

test("a legacy record is unverified when only the head moved", () => {
  const snapshot = legacySnapshot();
  legacyPull(snapshot).head.sha = OTHER;
  const verdict = judged(snapshot);
  assert.equal(verdict.status, "unverified");
  assert.deepEqual(verdict.reasons, ["trusted head differs from live readback"]);
});

test("a delivery with no completion record holds on completion evidence missing", () => {
  const verdict = judged(recordedSnapshot({ record: { [LEGACY]: null } }));
  assert.equal(verdict.status, "unverified");
  assert.deepEqual(verdict.reasons, ["completion evidence missing"]);
});
