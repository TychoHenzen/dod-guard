import assert from "node:assert/strict";
import test from "node:test";
import { indexSnapshot } from "../../../../lib/closure-index.mjs";
import { classifyQueue } from "../../../../lib/queue-classifier.mjs";
import { judgeDelivery } from "./closure-delivery.mjs";
import {
  DELIVERIES,
  REPOSITORY,
  closedWithoutEvidence,
  completionComment,
  issue,
  item,
  recordedSnapshot,
  setField,
} from "./closure.test-support.mjs";

const CHECKPOINT_REASON = "active checkpoint for issue #832 is not explicitly false";

function issueOf(snapshot, number) {
  return snapshot.issues.find((entry) => entry.number === number);
}

function pullOf(snapshot, number) {
  return snapshot.pullRequests.find((entry) => entry.number === number);
}

// The snapshot itself claims both checkpoints are finished and the head is trusted. Every test makes
// those claims, so a judgement that read them rather than the completion records would pass wrongly.
function claimsFinished(snapshot) {
  for (const number of [831, 832]) issueOf(snapshot, number).activeCheckpoint = false;
  pullOf(snapshot, 836).trustedHeadSha = DELIVERIES[831].head;
  return snapshot;
}

// #831 is the root, #832 its child, and pull request 836 is the delivery. Both issues record it.
function recordedBothWays() {
  const snapshot = claimsFinished(closedWithoutEvidence());
  issueOf(snapshot, 831).comments = [completionComment(831)];
  issueOf(snapshot, 832).comments = [completionComment(831)];
  return snapshot;
}

test("a sub-issue that records the same pull request keeps the delivery verified", () => {
  assert.equal(judgeDelivery(indexSnapshot(recordedBothWays()), 831).status, "verified");
});

test("a sub-issue whose own record names another pull request holds the delivery", () => {
  const snapshot = recordedBothWays();
  issueOf(snapshot, 832).comments = [completionComment(831, { pullRequest: 839 })];
  const judged = judgeDelivery(indexSnapshot(snapshot), 831);
  assert.equal(judged.status, "unverified");
  assert.ok(judged.reasons.includes(CHECKPOINT_REASON), judged.reasons.join("; "));
});

test("a sub-issue with no completion record holds the delivery despite its snapshot checkpoint", () => {
  const snapshot = recordedBothWays();
  issueOf(snapshot, 832).comments = [];
  const judged = judgeDelivery(indexSnapshot(snapshot), 831);
  assert.equal(judged.status, "unverified");
  assert.ok(judged.reasons.includes(CHECKPOINT_REASON), judged.reasons.join("; "));
});

test("a listed sub-issue outside the group holds the delivery", () => {
  const snapshot = recordedBothWays();
  setField(snapshot, 832, "Parent issue", null);
  const judged = judgeDelivery(indexSnapshot(snapshot), 831);
  assert.equal(judged.status, "unverified");
  assert.ok(judged.reasons.includes("sub-issue #832 is not grouped under #831"), judged.reasons.join("; "));
});

test("a parented delivery root still verifies", () => {
  const snapshot = recordedBothWays();
  snapshot.items.push(item(830, "Backlog"));
  snapshot.issues.push(issue(830, { children: [831] }));
  setField(snapshot, 831, "Parent issue", { repository: REPOSITORY, number: 830 });
  issueOf(snapshot, 831).parent = { repository: REPOSITORY, number: 830 };
  assert.equal(judgeDelivery(indexSnapshot(snapshot), 831).status, "verified");
});

test("a child that records its own delivery verifies, while the queue groups it under its parent", () => {
  const snapshot = recordedSnapshot();
  setField(snapshot, 841, "Parent issue", { repository: REPOSITORY, number: 840 });
  issueOf(snapshot, 841).parent = { repository: REPOSITORY, number: 840 };
  issueOf(snapshot, 840).children = [{ repository: REPOSITORY, number: 841 }];
  assert.equal(judgeDelivery(indexSnapshot(snapshot), 841).status, "verified");
  const queue = classifyQueue(snapshot, { today: "2026-10-10" });
  const group = queue.groups.find(({ rootIssueNumber }) => rootIssueNumber === 840);
  assert.ok(group.records.some(({ issueNumber }) => issueNumber === 841));
});

test("a delivery root whose parent has no Project item verifies, and the queue still holds that group", () => {
  const snapshot = recordedBothWays();
  setField(snapshot, 831, "Parent issue", { repository: REPOSITORY, number: 830 });
  issueOf(snapshot, 831).parent = { repository: REPOSITORY, number: 830 };
  const judged = judgeDelivery(indexSnapshot(snapshot), 831);
  assert.equal(judged.status, "verified", judged.reasons.join("; "));
  const queue = classifyQueue(snapshot, { today: "2026-10-10" });
  const group = queue.groups.find(({ rootIssueNumber }) => rootIssueNumber === 830);
  assert.ok(group.records.some(({ issueNumber }) => issueNumber === 831));
  assert.equal(group.decision.kind, "hold");
  assert.ok(group.decision.reasons.includes("parent issue #830 Project item"), group.decision.reasons.join("; "));
});

test("a root whose item links no pull request is held for that, not for a date", () => {
  const snapshot = recordedBothWays();
  const root = 831;
  assert.equal(judgeDelivery(indexSnapshot(snapshot), root).status, "verified");
  setField(snapshot, root, "Linked pull requests", []);
  const judged = judgeDelivery(indexSnapshot(snapshot), root);
  assert.equal(judged.status, "unverified");
  assert.ok(judged.reasons.includes("no merged pull request linked to the delivery"), judged.reasons.join("; "));
  assert.equal(judged.reasons.includes("local date missing"), false, judged.reasons.join("; "));
});
