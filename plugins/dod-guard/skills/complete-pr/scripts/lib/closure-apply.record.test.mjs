import assert from "node:assert/strict";
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
import { recordCompletion } from "./closure-apply.mjs";
import { parseCompletionRecord, recordComments } from "./closure-records.mjs";

test("record posts one completion record per closing issue and child, then updates it in place", () => {
  const snapshot = recordedSnapshot();
  const github = fakeGitHub(snapshot);
  const result = mergeResult([683]);
  const matrix = [
    { id: "AC-01", status: "pass" },
    { id: "AC-11", status: "unverified" },
  ];
  const first = recordCompletion({ repository: REPOSITORY, result, matrix, children: [777], runner: github.runner });
  assert.deepEqual(first.records, [
    { issue: 683, action: "posted" },
    { issue: 777, action: "posted" },
  ]);
  const marked = recordComments(github.state.issues.get(683).comments, "completion");
  assert.equal(marked.length, 1);
  assert.match(marked[0].body, /"pendingRows": \[\n {4}"AC-11"\n {2}\]/);
  const settled = [
    { id: "AC-01", status: "pass" },
    { id: "AC-11", status: "pass" },
  ];
  const second = recordCompletion({ repository: REPOSITORY, result, matrix: settled, runner: github.runner });
  assert.deepEqual(second.records, [{ issue: 683, action: "updated" }]);
  const again = recordCompletion({ repository: REPOSITORY, result, matrix: settled, runner: github.runner });
  assert.deepEqual(again.records, [{ issue: 683, action: "unchanged" }]);
  assert.match(github.state.issues.get(683).comments.at(-1).body, /"pendingRows": \[\]/);
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

test("record posts its own record and never edits a comment that quotes the markers", () => {
  const snapshot = recordedSnapshot();
  snapshot.issues.find(({ number }) => number === 683).comments = [quotingComment(7001)];
  const github = fakeGitHub(snapshot);
  const before = github.state.issues.get(683).comments[0].body;
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([683]),
    matrix: [{ id: "AC-01", status: "pass" }],
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: 683, action: "posted" }] });
  assert.equal(github.state.issues.get(683).comments[0].body, before);
  assert.deepEqual(patchesTo(github, 7001), []);
  assert.equal(recordComments(github.state.issues.get(683).comments, "completion").length, 1);
  assert.equal(github.state.issues.get(683).comments.length, 2);
});

test("record updates only the real record when a quoting comment sits beside it", () => {
  const snapshot = recordedSnapshot();
  snapshot.issues.find(({ number }) => number === 683).comments = [
    quotingComment(7001),
    completionComment(840, { pendingRows: ["AC-11"] }),
  ];
  const github = fakeGitHub(snapshot);
  const before = github.state.issues.get(683).comments[0].body;
  const settled = [
    { id: "AC-01", status: "pass" },
    { id: "AC-11", status: "pass" },
  ];
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([683]),
    matrix: settled,
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: 683, action: "updated" }] });
  assert.equal(patchesTo(github, 84_001).length, 1);
  assert.deepEqual(patchesTo(github, 7001), []);
  assert.equal(github.state.issues.get(683).comments[0].body, before);
  const records = recordComments(github.state.issues.get(683).comments, "completion");
  assert.equal(records.length, 1);
  assert.match(records[0].body, /"pendingRows": \[\]/);
});

test("record repairs a malformed real record in place instead of posting a second", () => {
  const snapshot = recordedSnapshot();
  const broken = { id: 555, body: completionComment(840).body.replace('"pullRequest"', '"pullRequest" oops') };
  snapshot.issues.find(({ number }) => number === 683).comments = [quotingComment(7001), broken];
  const github = fakeGitHub(snapshot);
  const before = github.state.issues.get(683).comments[0].body;
  const result = recordCompletion({
    repository: REPOSITORY,
    result: mergeResult([683]),
    matrix: [{ id: "AC-01", status: "pass" }],
    runner: github.runner,
  });
  assert.deepEqual(result, { records: [{ issue: 683, action: "updated" }] });
  assert.equal(patchesTo(github, 555).length, 1);
  const { comments } = github.state.issues.get(683);
  assert.equal(comments.length, 2);
  assert.equal(parseCompletionRecord(comments).record.commentId, 555);
  assert.equal(comments[0].body, before);
});
