import assert from "node:assert/strict";
import test from "node:test";
import { fakeGitHub, mutating, recordedSnapshot, setField, snapshotAfter } from "./closure.test-support.mjs";
import { applyClosures } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";

const ROOT = 818;
const STATE_REASON = "state_reason";

function mergedButNotDone() {
  const snapshot = recordedSnapshot({ roots: [] });
  setField(snapshot, ROOT, "Status", { name: "In Progress" });
  snapshot.issues.find(({ number }) => number === ROOT)[STATE_REASON] = "completed";
  return snapshot;
}

test("apply sets Done for a merged issue with a verified record and a replan lists no repair", () => {
  const snapshot = mergedButNotDone();
  const github = fakeGitHub(snapshot);
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.repaired, [ROOT]);
  assert.deepEqual(result.applied, []);
  assert.equal(github.state.statuses.get("PVTI_818"), "Done");
  assert.deepEqual(planClosures(snapshotAfter(snapshot, github)).statusRepairs, []);
});

test("a completed repair stops when the live issue was reopened", () => {
  const snapshot = mergedButNotDone();
  const github = fakeGitHub(snapshot);
  github.state.issues.get(ROOT).state = "open";
  const mark = github.calls.length;
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), /issue #818 is no longer closed/);
  assert.deepEqual(github.calls.slice(mark).filter(mutating), []);
});

test("a completed repair stops when the live issue is no longer closed as completed", () => {
  const snapshot = mergedButNotDone();
  const github = fakeGitHub(snapshot);
  github.state.issues.get(ROOT)[STATE_REASON] = "not_planned";
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), /no longer closed as completed/);
  assert.notEqual(github.state.statuses.get("PVTI_818"), "Done");
});
