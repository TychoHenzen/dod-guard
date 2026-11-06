import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { releaseSha } from "./harness/maintenance-harness.mjs";
import { runNativePublish } from "./harness/native-publish-harness.mjs";

test("native publish completes through the real git and gh default invokers", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runNativePublish();
  assert.equal(outcome.Success, true, outcome.Error);
  assert.equal(outcome.ReleaseSha, releaseSha);
  assert.equal(outcome.Restored, true);
  assert.equal(outcome.Error, null);
  // Success and Restored already prove no stderr line reached a parsed HTTP body (it would
  // fail JSON parsing or the saved-protection comparison); the stand-in writes it on every call.
  assert.doesNotMatch(outcome.ReleaseSha, /Bypassed|remote:/);
  assert.doesNotMatch(JSON.stringify(outcome), /Bypassed rule violations/);
});

test("native publish keeps protection restored when the real git push fails", {
  skip: process.platform !== "win32",
}, () => {
  const outcome = runNativePublish({ failGitPush: true });
  assert.equal(outcome.Success, false);
  assert.equal(outcome.Stage, "restore");
  assert.equal(outcome.DeleteAttempted, true);
  assert.equal(outcome.Restored, true);
  assert.equal(outcome.RestoreAttempts, 1);
  assert.match(outcome.Error, /git push .* failed with exit code 5: .*failed to push some refs/s);
});
