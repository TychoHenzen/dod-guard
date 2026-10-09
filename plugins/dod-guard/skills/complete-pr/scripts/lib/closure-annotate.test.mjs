import assert from "node:assert/strict";
import test from "node:test";
import { annotateSnapshot } from "./closure-delivery.mjs";
import { DELIVERIES, completionComment, recordedSnapshot } from "./closure.test-support.mjs";

function issueOf(snapshot, number) {
  return snapshot.issues.find((issue) => issue.number === number);
}

function pullOf(snapshot, number) {
  return snapshot.pullRequests.find((pull) => pull.number === number);
}

test("annotate takes the checkpoint and trusted head from the completion records", () => {
  const snapshot = recordedSnapshot({ record: { 841: { pendingRows: ["AC-11"] } } });
  issueOf(snapshot, 841).activeCheckpoint = false;
  const annotated = annotateSnapshot(snapshot);
  assert.equal(issueOf(annotated, 840).activeCheckpoint, false);
  assert.equal(pullOf(annotated, DELIVERIES[840].pull).trustedHeadSha, DELIVERIES[840].head);
  assert.equal(Object.hasOwn(issueOf(annotated, 841), "activeCheckpoint"), false);
  assert.equal(pullOf(annotated, DELIVERIES[841].pull).trustedHeadSha, DELIVERIES[841].head);
  assert.equal(Object.hasOwn(issueOf(annotated, 777), "activeCheckpoint"), false);
  assert.equal(Object.hasOwn(issueOf(snapshot, 840), "activeCheckpoint"), false, "the input is not modified");
});

test("annotate leaves a pull request untrusted when two records disagree on its head", () => {
  const snapshot = recordedSnapshot();
  issueOf(snapshot, 777).comments = [completionComment(840, { trustedHeadSha: "f".repeat(40) })];
  pullOf(snapshot, DELIVERIES[840].pull).trustedHeadSha = DELIVERIES[840].head;
  const annotated = annotateSnapshot(snapshot);
  assert.equal(Object.hasOwn(pullOf(annotated, DELIVERIES[840].pull), "trustedHeadSha"), false);
});
