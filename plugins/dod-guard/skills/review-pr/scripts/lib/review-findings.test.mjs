// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { buildReview, existingReview, postedFindings } from "./review-findings.mjs";

const HEAD = "d4cc4e05aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FIX = "plugins/dod-guard/skills/fix-pr-review/scripts/lib/fix-support.mjs";
const OTHER = "packages/unrelated/src/index.ts";

// Violation shapes copied from a whole-repository quality_scan of this branch (Windows separators included).
const scan = {
  violations: [
    { file: FIX.replaceAll("/", "\\"), line: 68, rule: "line-length", severity: "error", message: "line is 132 chars" },
    { file: FIX, line: 58, rule: "complexity", severity: "warn", message: "reviewThreadNodes() cyclomatic complexity 10" },
    { file: OTHER, line: 3, rule: "dead-export", severity: "error", message: "x is exported but never referenced anywhere" },
  ],
};
const diff = [
  `diff --git a/${FIX} b/${FIX}`,
  `--- a/${FIX}`,
  `+++ b/${FIX}`,
  "@@ -70,0 +71,3 @@",
  "+a",
  "+b",
  "+c",
].join("\n");

function judgment(overrides) {
  return {
    severity: "MAJOR",
    file: FIX,
    line: 72,
    problem: "Outdated threads are skipped",
    impact: "Real findings are never fixed",
    requirement: "AC 2",
    correction: "Keep outdated threads open",
    rootCause: "Outdated treated as stale",
    evidence: "fix-support.mjs:72 sets stale",
    ...overrides,
  };
}

test("scanner findings in changed files become one comment per file on its first changed line", () => {
  const { payload, recommendation } = buildReview({ headSha: HEAD, scan, changedFiles: [FIX], diff, results: [] });
  assert.equal(recommendation, "REQUEST_CHANGES");
  assert.equal(payload.comments.length, 1);
  const [comment] = payload.comments;
  assert.deepEqual([comment.path, comment.line, comment.side], [FIX, 71, "RIGHT"]);
  assert.match(comment.body, /^\*\*MAJOR\*\* quality-guard structural findings \(2\)/);
  assert.ok(comment.body.indexOf("line 58") < comment.body.indexOf("line 68"));
  assert.doesNotMatch(payload.body + comment.body, /dead-export/);
});

test("judgment findings dedupe by root cause and keep the highest severity", () => {
  const results = [
    { reviewer: "review-pr-feature", findings: [judgment({ severity: "MINOR" })] },
    { reviewer: "review-pr-reliability", findings: [judgment({ severity: "BLOCKER", rootCause: "outdated  treated as STALE" })] },
  ];
  const { payload, recommendation, counts } = buildReview({ headSha: HEAD, scan: { violations: [] }, changedFiles: [FIX], diff, results });
  assert.equal(recommendation, "BLOCK");
  assert.deepEqual(counts, { BLOCKER: 1, MAJOR: 0, MINOR: 0 });
  assert.equal(payload.comments.length, 1);
  assert.match(payload.comments[0].body, /^\*\*BLOCKER\*\* Outdated threads are skipped[\s\S]*\(review-pr-reliability\)/);
});

test("a finding off the changed lines moves into the review body", () => {
  const results = [{ reviewer: "review-pr-design", findings: [judgment({ line: 5 })] }];
  const { payload } = buildReview({ headSha: HEAD, scan: { violations: [] }, changedFiles: [FIX], diff, results });
  assert.equal(payload.comments.length, 0);
  assert.match(payload.body, /### `plugins\/dod-guard\/skills\/fix-pr-review\/scripts\/lib\/fix-support\.mjs`\n\*\*MAJOR\*\*/);
});

test("a clean review approves and carries the marker", () => {
  const { payload, recommendation } = buildReview({ headSha: HEAD, scan: { violations: [] }, changedFiles: [FIX], diff, results: [] });
  assert.equal(recommendation, "APPROVE");
  assert.deepEqual([payload.event, payload.commit_id, payload.comments], ["COMMENT", HEAD, []]);
  assert.deepEqual(existingReview([{ id: 9, body: payload.body, html_url: "u" }]), {
    found: true,
    reviewId: 9,
    headSha: HEAD,
    recommendation: "APPROVE",
    url: "u",
  });
  assert.deepEqual(existingReview([{ id: 1, body: "LGTM" }]), { found: false });
});

test("a malformed reviewer finding stops the build", () => {
  const results = [{ reviewer: "review-pr-hygiene", findings: [judgment({ correction: " " })] }];
  assert.throws(
    () => buildReview({ headSha: HEAD, scan: { violations: [] }, changedFiles: [FIX], diff, results }),
    /review-pr-hygiene returned a finding without correction/,
  );
});

test("posted comments read back as GH ids with their severity", () => {
  const comments = [
    { id: 41, pull_request_review_id: 7, path: FIX, line: 71, html_url: "a", body: "**MAJOR** quality-guard structural findings (2)" },
    { id: 42, pull_request_review_id: 7, path: FIX, line: 72, html_url: "b", body: "**BLOCKER** Outdated threads" },
    { id: 43, pull_request_review_id: 7, in_reply_to_id: 42, path: FIX, line: 72, body: "Fixed." },
    { id: 44, pull_request_review_id: 8, path: FIX, line: 1, body: "**MINOR** other review" },
  ];
  assert.deepEqual(
    postedFindings(7, comments).map((finding) => [finding.id, finding.severity]),
    [
      ["GH-41", "MAJOR"],
      ["GH-42", "BLOCKER"],
    ],
  );
});
