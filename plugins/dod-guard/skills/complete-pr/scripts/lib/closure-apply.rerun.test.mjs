import assert from "node:assert/strict";
import test from "node:test";
import { fakeGitHub, mutating, recordedSnapshot, snapshotAfter } from "./closure.test-support.mjs";
import { applyClosures } from "./closure-apply.mjs";
import { planClosures } from "./closure-plan.mjs";
import {
  applyThatStops,
  CLOSE_NO_COMMENT,
  evidenceCount,
  failClose,
  REPLACED_ORIGINAL,
  stepNames,
  stoppedBeforeDone,
} from "./harness/closure-apply-steps.mjs";

test("a rerun after a failed close posts no second comment and finishes the close", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { failOnce: failClose });
  const stop = applyThatStops(snapshot, github);
  assert.deepEqual(
    stop.state.steps.map(({ step }) => step),
    ["read", "comment"],
  );
  assert.equal(evidenceCount(github, REPLACED_ORIGINAL), 1);
  assert.equal(github.state.issues.get(REPLACED_ORIGINAL).state, "open");
  const rerun = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(stepNames(rerun), CLOSE_NO_COMMENT);
  assert.equal(evidenceCount(github, REPLACED_ORIGINAL), 1);
  assert.equal(github.state.issues.get(REPLACED_ORIGINAL).state, "closed");
  assert.equal(github.state.statuses.get("PVTI_777"), "Done");
});

test("a rerun after a stopped Done write sets Done without another comment or close", () => {
  const { snapshot, github } = stoppedBeforeDone();
  assert.equal(github.state.issues.get(REPLACED_ORIGINAL).state, "closed");
  assert.equal(github.state.statuses.get("PVTI_777"), "Backlog");
  const after = snapshotAfter(snapshot, github);
  const replanned = planClosures(after);
  assert.deepEqual(replanned.closes, []);
  assert.deepEqual(replanned.statusRepairs, [{ issue: 777, itemId: "PVTI_777", status: "Backlog" }]);
  const mark = github.calls.length;
  const rerun = applyClosures(after, { runner: github.runner });
  assert.deepEqual(rerun.repaired, [REPLACED_ORIGINAL]);
  assert.deepEqual(rerun.applied, []);
  const writes = github.calls.slice(mark).filter(mutating);
  assert.equal(writes.length, 1);
  assert.equal(github.state.statuses.get("PVTI_777"), "Done");
  assert.equal(evidenceCount(github, REPLACED_ORIGINAL), 1);
});

test("a status repair stops when the issue was reopened", () => {
  const { snapshot, github } = stoppedBeforeDone();
  const after = snapshotAfter(snapshot, github);
  github.state.issues.get(REPLACED_ORIGINAL).state = "open";
  const mark = github.calls.length;
  assert.throws(() => applyClosures(after, { runner: github.runner }), /issue #777 is no longer closed/);
  assert.deepEqual(github.calls.slice(mark).filter(mutating), []);
});
