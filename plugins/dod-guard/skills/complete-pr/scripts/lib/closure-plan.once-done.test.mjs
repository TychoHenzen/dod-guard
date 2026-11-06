import assert from "node:assert/strict";
import test from "node:test";
import { completionComment, recordedSnapshot, setField } from "./closure.test-support.mjs";
import { planClosures } from "./closure-plan.mjs";

const ROOT = 818;
const ROOT_PULL = 819;
const STATE_REASON = "state_reason";

function rootOf(snapshot) {
  return snapshot.issues.find(({ number }) => number === ROOT);
}

function pullOf(snapshot) {
  return snapshot.pullRequests.find(({ number }) => number === ROOT_PULL);
}

// disc-golf #11 shape: closed as completed by the merged pull request, its completion record
// posted, and its Project item still In Progress because no run wrote Done.
function mergedButNotDone() {
  const snapshot = recordedSnapshot({ roots: [] });
  setField(snapshot, ROOT, "Status", { name: "In Progress" });
  rootOf(snapshot)[STATE_REASON] = "completed";
  return snapshot;
}

test("a completed close with a verified completion record gets a Done repair", () => {
  const plan = planClosures(mergedButNotDone());
  assert.deepEqual(plan.statusRepairs, [
    { issue: ROOT, itemId: "PVTI_818", status: "In Progress", stateReason: "completed" },
  ]);
  assert.deepEqual(plan.closes, []);
});

test("no repair when the delivery is not verified apart from the Done status", () => {
  const cases = {
    "no completion record": (snapshot) => {
      rootOf(snapshot).comments = [];
    },
    "pending acceptance rows": (snapshot) => {
      rootOf(snapshot).comments = [completionComment(ROOT, { pendingRows: ["AC-1"] })];
    },
    "required checks pending": (snapshot) => {
      pullOf(snapshot).requiredChecks = [{ name: "build-test", bucket: "pending" }];
    },
    "merge commit differs": (snapshot) => {
      pullOf(snapshot).mergeCommit = { oid: "e".repeat(40) };
    },
    "issue reopened": (snapshot) => {
      rootOf(snapshot).state = "open";
    },
    "no recorded close reason": (snapshot) => {
      delete rootOf(snapshot)[STATE_REASON];
    },
  };
  for (const [label, mutate] of Object.entries(cases)) {
    const snapshot = mergedButNotDone();
    mutate(snapshot);
    assert.deepEqual(planClosures(snapshot).statusRepairs, [], label);
  }
});

test("an item already Done gets no repair", () => {
  const snapshot = mergedButNotDone();
  setField(snapshot, ROOT, "Status", { name: "Done" });
  assert.deepEqual(planClosures(snapshot).statusRepairs, []);
});
