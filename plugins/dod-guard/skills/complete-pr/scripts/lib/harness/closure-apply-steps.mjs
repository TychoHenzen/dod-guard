import assert from "node:assert/strict";
import { fakeGitHub, mutating, recordedSnapshot } from "../closure.test-support.mjs";
import { applyClosures } from "../closure-apply.mjs";
import { recordComments } from "../closure-records.mjs";

export const FULL_CLOSE = ["read", "comment", "close", "readback", "project-status"];
export const CLOSE_NO_COMMENT = ["read", "close", "readback", "project-status"];
export const STOPPED_BEFORE_DONE = ["read", "comment", "close", "readback"];
export const REPLACED_ORIGINAL = 777;

const isProjectWrite = (args) => args.some((value) => String(value).startsWith("users/"));
export const failClose = (args) => mutating(args) && args.includes("state=closed");
export const failDone = (args) => mutating(args) && isProjectWrite(args);

export function evidenceCount(github, issue) {
  return recordComments(github.state.issues.get(issue).comments, "closure").length;
}

export const stepNames = (result) => result.steps.map(({ step }) => step);

// Runs an apply that must stop, and returns the stop for the caller to inspect.
export function applyThatStops(snapshot, github) {
  let stop = null;
  assert.throws(
    () => applyClosures(snapshot, { runner: github.runner }),
    (error) => {
      stop = error;
      return true;
    },
  );
  assert.equal(stop.code, "closure_stop");
  return stop;
}

// A replaced original whose Done write fails once, leaving it closed with Done unset.
export function stoppedBeforeDone() {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { failOnce: failDone });
  const stop = applyThatStops(snapshot, github);
  assert.deepEqual(
    stop.state.steps.map(({ step }) => step),
    STOPPED_BEFORE_DONE,
  );
  return { snapshot, github };
}
