import assert from "node:assert/strict";
import test from "node:test";
import { fakeGitHub, recordedSnapshot } from "./closure.test-support.mjs";
import { applyClosures } from "./closure-apply.mjs";

const RESULT_KEYS = ["applied", "repaired", "steps", "plan"];

test("apply lists its result before the plan", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const applied = applyClosures(snapshot, { runner: fakeGitHub(snapshot).runner });
  assert.deepEqual(Object.keys(applied), RESULT_KEYS);
});

test("a no-op apply lists its result before the plan", () => {
  const noOp = recordedSnapshot({ roots: [840], record: { 840: null } });
  const result = applyClosures(noOp, { runner: fakeGitHub(noOp).runner });
  assert.deepEqual(Object.keys(result), RESULT_KEYS);
});
