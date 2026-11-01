// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { visibleIdEdits } from "./visible-ids.mjs";

const COMMENTS = [
  { id: 41, pull_request_review_id: 7, body: "**MAJOR** Fix the check" },
  { id: 42, pull_request_review_id: 7, body: "**BLOCKER** Outdated threads\n" },
  { id: 43, pull_request_review_id: 7, in_reply_to_id: 42, body: "Fixed." },
  { id: 44, pull_request_review_id: 8, body: "**MINOR** other review" },
  { id: 45, pull_request_review_id: 7, body: "**MAJOR** Mentions GH-9 in passing" },
];

test("each top-level comment of the review gets its own id as the last line", () => {
  assert.deepEqual(visibleIdEdits(7, COMMENTS), [
    { id: 41, body: "**MAJOR** Fix the check\n\nGH-41" },
    { id: 42, body: "**BLOCKER** Outdated threads\n\nGH-42" },
    { id: 45, body: "**MAJOR** Mentions GH-9 in passing\n\nGH-45" },
  ]);
});

test("a comment that already ends with its id is left alone, so a rerun adds nothing", () => {
  const applied = COMMENTS.map((comment) => {
    const edit = visibleIdEdits(7, COMMENTS).find(({ id }) => id === comment.id);
    return edit ? { ...comment, body: edit.body } : comment;
  });
  assert.deepEqual(visibleIdEdits(7, applied), []);
});

test("a comment ending with another comment's id still gets its own", () => {
  const comments = [{ id: 50, pull_request_review_id: 7, body: "**MAJOR** x\n\nGH-49" }];
  assert.deepEqual(visibleIdEdits(7, comments), [{ id: 50, body: "**MAJOR** x\n\nGH-49\n\nGH-50" }]);
});

test("a review with no comment yields no edit", () => {
  assert.deepEqual(visibleIdEdits(99, COMMENTS), []);
});
