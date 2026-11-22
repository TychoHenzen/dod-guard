import assert from "node:assert/strict";
import test from "node:test";
import { DELIVERIES, fakeGitHub, mergeResult, REPOSITORY, recordedSnapshot } from "./closure.test-support.mjs";
import { recordCompletion } from "./closure-completion.mjs";
import { recordComments } from "./closure-records.mjs";
import {
  CLOSING_ISSUE,
  closingComments,
  PASSING,
  PENDING_ROWS_EMPTY,
  recordFor,
  SETTLED,
} from "./harness/closure-completion-cases.mjs";

const CHILD_ISSUE = 777;
const PENDING_ROWS_OPEN = /"pendingRows": \[\n {4}"AC-11"\n {2}\]/;

test("record posts one completion record per closing issue and child, then updates it in place", () => {
  const github = fakeGitHub(recordedSnapshot());
  const result = mergeResult([CLOSING_ISSUE]);
  const pending = [PASSING[0], { id: "AC-11", status: "unverified" }];
  const first = recordCompletion({
    repository: REPOSITORY,
    result,
    matrix: pending,
    children: [CHILD_ISSUE],
    runner: github.runner,
  });
  assert.deepEqual(first.records, [
    { issue: CLOSING_ISSUE, action: "posted" },
    { issue: CHILD_ISSUE, action: "posted" },
  ]);
  const marked = recordComments(closingComments(github), "completion");
  assert.equal(marked.length, 1);
  assert.match(marked[0].body, PENDING_ROWS_OPEN);
  assert.deepEqual(recordFor(github, SETTLED).records, [{ issue: CLOSING_ISSUE, action: "updated" }]);
  assert.deepEqual(recordFor(github, SETTLED).records, [{ issue: CLOSING_ISSUE, action: "unchanged" }]);
  assert.match(closingComments(github).at(-1).body, PENDING_ROWS_EMPTY);
});

test("record rejects an incomplete merge result before any call", () => {
  const github = fakeGitHub(recordedSnapshot());
  const result = { pullNumber: 901, trustedHead: "abc", mergeCommitSha: DELIVERIES[840].merge, linkedIssues: [] };
  assert.throws(
    () => recordCompletion({ repository: REPOSITORY, result, matrix: [], runner: github.runner }),
    /merge result needs/,
  );
  assert.deepEqual(github.calls, []);
});
