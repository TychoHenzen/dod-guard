import assert from "node:assert/strict";
import test from "node:test";
import { fakeGitHub, mutating, recordedSnapshot } from "./closure.test-support.mjs";
import { applyClosures } from "./closure-apply.mjs";
import { FULL_CLOSE, REPLACED_ORIGINAL, stepNames } from "./harness/closure-apply-steps.mjs";

test("apply comments, closes, reads back, and sets Done for a replaced original", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot);
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.applied, [REPLACED_ORIGINAL]);
  assert.deepEqual(stepNames(result), FULL_CLOSE);
  const closed = github.state.issues.get(REPLACED_ORIGINAL);
  assert.equal(closed.state, "closed");
  assert.equal(closed.state_reason, "completed");
  assert.match(closed.comments[0].body, /Superseded by #840, delivered by pull request #901/);
  assert.equal(github.state.statuses.get("PVTI_777"), "Done");
});

test("apply makes no mutating call when every close is held", () => {
  for (const options of [
    { record: { 840: null } },
    { record: { 840: { pendingRows: ["AC-11"] } } },
    { pull: { 840: { checks: "fail" } } },
  ]) {
    const snapshot = recordedSnapshot({ roots: [840], ...options });
    const github = fakeGitHub(snapshot);
    const result = applyClosures(snapshot, { runner: github.runner });
    assert.deepEqual(result.applied, []);
    assert.deepEqual(github.calls, []);
  }
});

test("apply stops before writing when the root no longer verifies live", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot);
  const rootRecord = github.state.issues.get(840).comments[0];
  rootRecord.body = rootRecord.body.replace("[]", '["AC-11"]');
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), /root #840 no longer verifies/);
  assert.deepEqual(github.calls.filter(mutating), []);
});

test("a readback that disagrees stops with the actual state and no further mutation", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { ignoreClose: true });
  assert.throws(
    () => applyClosures(snapshot, { runner: github.runner }),
    (error) => {
      assert.match(error.message, /issue #777 readback disagrees/);
      assert.equal(error.state.state, "open");
      assert.equal(error.state.evidenceComments, 1);
      return true;
    },
  );
  assert.ok(github.calls.filter(mutating).at(-1).includes("state=closed"));
  assert.equal(github.state.statuses.get("PVTI_777"), "Backlog");
});

test("apply refuses to write without the Project identity", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  delete snapshot.project;
  const github = fakeGitHub(snapshot);
  assert.throws(() => applyClosures(snapshot, { runner: github.runner }), /snapshot.project needs/);
  assert.deepEqual(github.calls, []);
});
