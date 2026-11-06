import assert from "node:assert/strict";
import test from "node:test";
import { completionComment, patchesTo, quotingComment } from "./closure.test-support.mjs";
import { parseCompletionRecord, recordComments } from "./closure-records.mjs";
import {
  CLOSING_ISSUE,
  closingComments,
  PASSING,
  PENDING_ROWS_EMPTY,
  QUOTING_COMMENT_ID,
  recordFor,
  SETTLED,
  snapshotWithComments,
} from "./harness/closure-completion-cases.mjs";

const REAL_RECORD_COMMENT_ID = 84_001;
const BROKEN_RECORD_COMMENT_ID = 555;
const ROOT = 840;

test("record posts its own record and never edits a comment that quotes the markers", () => {
  const { github } = snapshotWithComments([quotingComment(QUOTING_COMMENT_ID)]);
  const before = closingComments(github)[0].body;
  const result = recordFor(github, PASSING);
  assert.deepEqual(result, { records: [{ issue: CLOSING_ISSUE, action: "posted" }] });
  assert.equal(closingComments(github)[0].body, before);
  assert.deepEqual(patchesTo(github, QUOTING_COMMENT_ID), []);
  assert.equal(recordComments(closingComments(github), "completion").length, 1);
  assert.equal(closingComments(github).length, 2);
});

test("record updates only the real record when a quoting comment sits beside it", () => {
  const pending = completionComment(ROOT, { pendingRows: ["AC-11"] });
  const { github } = snapshotWithComments([quotingComment(QUOTING_COMMENT_ID), pending]);
  const before = closingComments(github)[0].body;
  const result = recordFor(github, SETTLED);
  assert.deepEqual(result, { records: [{ issue: CLOSING_ISSUE, action: "updated" }] });
  assert.equal(patchesTo(github, REAL_RECORD_COMMENT_ID).length, 1);
  assert.deepEqual(patchesTo(github, QUOTING_COMMENT_ID), []);
  assert.equal(closingComments(github)[0].body, before);
  const records = recordComments(closingComments(github), "completion");
  assert.equal(records.length, 1);
  assert.match(records[0].body, PENDING_ROWS_EMPTY);
});

test("record repairs a malformed real record in place instead of posting a second", () => {
  const broken = {
    id: BROKEN_RECORD_COMMENT_ID,
    body: completionComment(ROOT).body.replace('"pullRequest"', '"pullRequest" oops'),
  };
  const { github } = snapshotWithComments([quotingComment(QUOTING_COMMENT_ID), broken]);
  const before = closingComments(github)[0].body;
  const result = recordFor(github, PASSING);
  assert.deepEqual(result, { records: [{ issue: CLOSING_ISSUE, action: "updated" }] });
  assert.equal(patchesTo(github, BROKEN_RECORD_COMMENT_ID).length, 1);
  const comments = closingComments(github);
  assert.equal(comments.length, 2);
  assert.equal(parseCompletionRecord(comments).record.commentId, BROKEN_RECORD_COMMENT_ID);
  assert.equal(comments[0].body, before);
});
