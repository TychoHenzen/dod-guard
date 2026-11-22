// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { scannerReview } from "./scanner-review.test-support.mjs";

const REMOVED = "plugins/dod-guard/skills/review-pr/scripts/lib/removed-only.mjs";
const ADDED = "plugins/dod-guard/skills/review-pr/scripts/lib/added-lines.mjs";
const keep = (ids) => ({ ids, status: "KEEP" });

test("a MAJOR scanner group on a file with no added line gets a thread on that file's removed line", () => {
  const message = "file is 600 lines";
  const violations = [
    { file: REMOVED, line: 600, rule: "file-length", severity: "high", message },
    { file: ADDED, line: 10, rule: "line-length", severity: "medium", message: "line is 85 chars" },
  ];
  const files = [ADDED, REMOVED];
  const { payload, counts, recommendation } = scannerReview({
    files,
    line: 10,
    violations,
    rule: keep,
    removed: [REMOVED],
  });
  assert.equal(recommendation, "REQUEST_CHANGES");
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 1, MINOR: 1 });
  assert.deepEqual(
    payload.comments.map((comment) => [comment.path, comment.line, comment.side]),
    [[REMOVED, 4, "LEFT"]],
  );
  assert.match(payload.comments[0].body, /^\*\*MAJOR\*\* quality-guard structural findings \(1\)/);
  assert.match(payload.comments[0].body, /Cited location: `[^`]*removed-only\.mjs:600`\. This PR only removes lines/);
  assert.doesNotMatch(payload.body, /no added line/);
});

test("a MAJOR scanner group on a file with added lines moves to that file's nearest added line", () => {
  const violations = [
    { file: REMOVED, line: 600, rule: "file-length", severity: "high", message: "file is 600 lines" },
    { file: ADDED, line: 600, rule: "file-length", severity: "high", message: "file is 700 lines" },
  ];
  const files = [ADDED, REMOVED];
  const { payload } = scannerReview({ files, line: 10, violations, rule: keep, removed: [REMOVED] });
  assert.deepEqual(
    payload.comments.map((comment) => [comment.path, comment.line, comment.side]),
    [
      [ADDED, 10, "RIGHT"],
      [REMOVED, 4, "LEFT"],
    ],
  );
  const cited = `Cited location: \`${ADDED}:600\`, which is outside the lines this PR changes\\.`;
  assert.match(payload.comments[0].body, new RegExp(cited));
  assert.doesNotMatch(payload.body, /no added line/);
});
