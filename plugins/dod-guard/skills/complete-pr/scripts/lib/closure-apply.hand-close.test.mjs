import assert from "node:assert/strict";
import test from "node:test";
import { fakeGitHub, issue, item, recordedSnapshot, snapshotAfter } from "./closure.test-support.mjs";
import { applyClosures } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";
import { evidenceCount, REPLACED_ORIGINAL } from "./harness/closure-apply-steps.mjs";

// disc-golf #60 shape: roots [840] keeps the usual close of #777 in the plan, and #2001 is an owner
// hand close as not_planned on an In Progress Project item.
const HAND_CLOSED_ISSUE = 2001;
const STATE_REASON = "state_reason";

function withHandClosed() {
  const snapshot = recordedSnapshot({ roots: [840] });
  snapshot.items.push(item(HAND_CLOSED_ISSUE, "In Progress"));
  snapshot.issues.push(Object.assign(issue(HAND_CLOSED_ISSUE), { state: "closed", [STATE_REASON]: "not_planned" }));
  return snapshot;
}

test("apply sets Done for a not_planned hand close and a replan lists no repair", () => {
  const snapshot = withHandClosed();
  const github = fakeGitHub(snapshot);
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.applied, [REPLACED_ORIGINAL]);
  assert.deepEqual(result.repaired, [HAND_CLOSED_ISSUE]);
  assert.equal(github.state.statuses.get("PVTI_2001"), "Done");
  assert.equal(github.state.issues.get(HAND_CLOSED_ISSUE)[STATE_REASON], "not_planned");
  assert.equal(evidenceCount(github, HAND_CLOSED_ISSUE), 0);
  assert.deepEqual(planClosures(snapshotAfter(snapshot, github)).statusRepairs, []);
});

test("a not_planned repair stops when the live issue is no longer closed as not_planned", () => {
  const snapshot = withHandClosed();
  const github = fakeGitHub(snapshot);
  github.state.issues.get(HAND_CLOSED_ISSUE)[STATE_REASON] = "completed";
  assert.throws(
    () => applyClosures(snapshot, { runner: github.runner }),
    /issue #2001 is no longer closed as not_planned/,
  );
  assert.notEqual(github.state.statuses.get("PVTI_2001"), "Done");
});
