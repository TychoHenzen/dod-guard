import assert from "node:assert/strict";
import test from "node:test";
import { fakeGitHub, quotingComment, REPOSITORY, recordedSnapshot } from "./closure.test-support.mjs";
import { applyClosures } from "./closure-apply.mjs";
import { renderClosureEvidence } from "./closure-records.mjs";
import {
  CLOSE_NO_COMMENT,
  evidenceCount,
  FULL_CLOSE,
  REPLACED_ORIGINAL,
  stepNames,
} from "./harness/closure-apply-steps.mjs";

const QUOTE_ID = 7001;
const COMMENTS_ROUTE = `repos/${REPOSITORY}/issues/777/comments`;
const isPost = (args) => args.includes("POST") && args.includes(COMMENTS_ROUTE);

function originalOf(snapshot) {
  return snapshot.issues.find(({ number }) => number === REPLACED_ORIGINAL);
}

test("apply posts real closure evidence when the only marker text is a quote", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  originalOf(snapshot).comments = [quotingComment(QUOTE_ID)];
  const github = fakeGitHub(snapshot);
  const quote = github.state.issues.get(REPLACED_ORIGINAL).comments[0].body;
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.applied, [REPLACED_ORIGINAL]);
  assert.deepEqual(stepNames(result), FULL_CLOSE);
  const closed = github.state.issues.get(REPLACED_ORIGINAL);
  assert.equal(closed.state, "closed");
  assert.equal(evidenceCount(github, REPLACED_ORIGINAL), 1);
  assert.equal(closed.comments.length, 2);
  assert.equal(closed.comments.find(({ id }) => id === QUOTE_ID).body, quote);
  assert.ok(github.calls.some(isPost));
});

test("apply is not stopped as duplicate by a quote beside real closure evidence", () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const evidence = renderClosureEvidence({ issue: 777, stateReason: "completed", evidence: ["Superseded by #840."] });
  originalOf(snapshot).comments = [{ id: 7002, body: evidence }, quotingComment(QUOTE_ID)];
  const github = fakeGitHub(snapshot);
  const quote = github.state.issues.get(REPLACED_ORIGINAL).comments[1].body;
  const result = applyClosures(snapshot, { runner: github.runner });
  assert.deepEqual(result.applied, [REPLACED_ORIGINAL]);
  assert.deepEqual(stepNames(result), CLOSE_NO_COMMENT);
  assert.equal(evidenceCount(github, REPLACED_ORIGINAL), 1);
  assert.deepEqual(github.calls.filter(isPost), []);
  assert.equal(github.state.issues.get(REPLACED_ORIGINAL).comments[1].body, quote);
});
