// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  completionComment,
  DELIVERIES,
  fakeGitHub,
  mergeResult,
  patchesTo,
  quotingComment,
  REPOSITORY,
  recordedSnapshot,
} from "./closure.test-support.mjs";
import { recordCompletion } from "./closure-completion.mjs";
import { parseCompletionRecord, recordComments } from "./closure-records.mjs";

const CLOSING_ISSUE = 683;
const CHILD_ISSUE = 777;
const COMPLETION_ROOT = 840;
const QUOTING_COMMENT_ID = 7001;
const REAL_RECORD_COMMENT_ID = 84_001;
const BROKEN_RECORD_COMMENT_ID = 555;
const PENDING_ROWS_OPEN = /"pendingRows": \[\n {4}"AC-11"\n {2}\]/;
const PENDING_ROWS_EMPTY = /"pendingRows": \[\]/;
const MERGE_RESULT_NEEDS = /merge result needs/;

const closingComments = (github) => github.state.issues.get(CLOSING_ISSUE).comments;
const closingIssueIn = (snapshot) => snapshot.issues.find(({ number }) => number === CLOSING_ISSUE);

test("record posts one completion record per closing issue and child, then updates it in place", () => {
  const snapshot = recordedSnapshot();
  const github = fakeGitHub(snapshot);
  const result = mergeResult([CLOSING_ISSUE]);
  const matrix = [
    { id: "AC-01", status: "pass" },
    { id: "AC-11", status: "unverified" },
  ];
  const first = recordCompletion({
    repository: REPOSITORY,
    result,
    matrix,
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
  const settled = [
    { id: "AC-01", status: "pass" },
    { id: "AC-11", status: "pass" },
  ];
  const second = recordCompletion({ repository: REPOSITORY, result, matrix: settled, runner: github.runner });
  assert.deepEqual(second.records, [{ issue: CLOSING_ISSUE, action: "updated" }]);
  const again = recordCompletion({ repository: REPOSITORY, result, matrix: settled, runner: github.runner });
  assert.deepEqual(again.records, [{ issue: CLOSING_ISSUE, action: "unchanged" }]);
  assert.match(closingComments(github).at(-1).body, PENDING_ROWS_EMPTY);
});

test("record rejects an incomplete merge result before any call", () => {
  const github = fakeGitHub(recordedSnapshot());
  const result = {
    pullNumber: 901,
    trustedHead: "abc",
    mergeCommitSha: DELIVERIES[COMPLETION_ROOT].merge,
    linkedIssues: [],
  };
  assert.throws(
    () => recordCompletion({ repository: REPOSITORY, result, matrix: [], runner: github.runner }),
    MERGE_RESULT_NEEDS,
  );
  assert.deepEqual(github.calls, []);
});

test("record posts its own record and never edits a comment that quotes the markers", () => {
  const snapshot = recordedSnapshot();
  closingIssueIn(snapshot).comments = [quotingComment(QUOTING_COMMENT_ID)];
  const github = fakeGitHub(snapshot);
  const before = closingComments(github)[0].body;
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([CLOSING_ISSUE]),
    matrix: [{ id: "AC-01", status: "pass" }],
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: CLOSING_ISSUE, action: "posted" }] });
  assert.equal(closingComments(github)[0].body, before);
  assert.deepEqual(patchesTo(github, QUOTING_COMMENT_ID), []);
  assert.equal(recordComments(closingComments(github), "completion").length, 1);
  assert.equal(closingComments(github).length, 2);
});

test("record updates only the real record when a quoting comment sits beside it", () => {
  const snapshot = recordedSnapshot();
  closingIssueIn(snapshot).comments = [
    quotingComment(QUOTING_COMMENT_ID),
    completionComment(COMPLETION_ROOT, { pendingRows: ["AC-11"] }),
  ];
  const github = fakeGitHub(snapshot);
  const before = closingComments(github)[0].body;
  const settled = [
    { id: "AC-01", status: "pass" },
    { id: "AC-11", status: "pass" },
  ];
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([CLOSING_ISSUE]),
    matrix: settled,
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: CLOSING_ISSUE, action: "updated" }] });
  assert.equal(patchesTo(github, REAL_RECORD_COMMENT_ID).length, 1);
  assert.deepEqual(patchesTo(github, QUOTING_COMMENT_ID), []);
  assert.equal(closingComments(github)[0].body, before);
  const records = recordComments(closingComments(github), "completion");
  assert.equal(records.length, 1);
  assert.match(records[0].body, PENDING_ROWS_EMPTY);
});

test("record repairs a malformed real record in place instead of posting a second", () => {
  const snapshot = recordedSnapshot();
  const broken = {
    id: BROKEN_RECORD_COMMENT_ID,
    body: completionComment(COMPLETION_ROOT).body.replace('"pullRequest"', '"pullRequest" oops'),
  };
  closingIssueIn(snapshot).comments = [quotingComment(QUOTING_COMMENT_ID), broken];
  const github = fakeGitHub(snapshot);
  const before = closingComments(github)[0].body;
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([CLOSING_ISSUE]),
    matrix: [{ id: "AC-01", status: "pass" }],
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: CLOSING_ISSUE, action: "updated" }] });
  assert.equal(patchesTo(github, BROKEN_RECORD_COMMENT_ID).length, 1);
  const comments = closingComments(github);
  assert.equal(comments.length, 2);
  assert.equal(parseCompletionRecord(comments).record.commentId, BROKEN_RECORD_COMMENT_ID);
  assert.equal(comments[0].body, before);
});
