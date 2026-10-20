// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { existingReview, postedFindings } from "./review-findings.mjs";
import { findingsFixture, judgment } from "./review-pr.test-support.mjs";

const { HEAD, FIX, UNICODE, scan, diff, review } = findingsFixture;

test("structural rules cover the whole touched file and line rules only the changed lines", () => {
  const { payload } = review([], { scan });
  const fix = payload.comments.find((comment) => comment.path === FIX);
  assert.match(fix.body, /^\*\*MAJOR\*\* quality-guard structural findings \(2\)/);
  assert.match(fix.body, /`complexity` line 58[\s\S]*`line-length` line 72/);
  assert.doesNotMatch(fix.body, /line 5:/);
  assert.equal(fix.line, 71);
  assert.doesNotMatch(JSON.stringify(payload), /dead-export/);
});

test("a changed file Git quotes in the diff still gets its scanner findings", () => {
  const { payload } = review([], { scan });
  assert.match(payload.body, /`docs\/ü\.md:1`\n\*\*MINOR\*\* quality-guard structural findings \(1\)/);
});

test("a scanner group whose findings are all low is MINOR", () => {
  const lowOnly = {
    violations: [
      {
        file: UNICODE,
        line: 1,
        rule: "file-length",
        severity: "low",
        message: "file is 600 lines",
      },
    ],
  };
  const { payload } = review([], { scan: lowOnly });
  assert.match(payload.body, /\*\*MINOR\*\* quality-guard structural findings \(1\)/);
});

test("MINOR findings are listed in the body, get no thread, and do not block", () => {
  const findings = [judgment(FIX, { severity: "MINOR" })];
  const results = [{ reviewer: "review-pr-design", findings }];
  const { payload, recommendation, counts } = review(results);
  assert.equal(recommendation, "APPROVE");
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 0, MINOR: 1 });
  assert.deepEqual(payload.comments, []);
  assert.match(payload.body, /### Minor notes\n\nThese do not block the merge and need no reply\./);
});

test("a MAJOR finding still requests changes and stays inline", () => {
  const findings = [judgment(FIX, { severity: "MAJOR" })];
  const results = [{ reviewer: "review-pr-design", findings }];
  const { payload, recommendation } = review(results);
  assert.equal(recommendation, "REQUEST_CHANGES");
  assert.equal(payload.comments.length, 1);
  assert.doesNotMatch(payload.body, /### Minor notes/);
});

test("a scanner severity outside high/medium/low fails the review build", () => {
  const legacy = {
    violations: [
      {
        file: FIX,
        line: 5,
        rule: "line-length",
        severity: "error",
        message: "line is 85 chars",
      },
    ],
  };
  assert.throws(
    () => review([], { scan: legacy }),
    /unknown severity "error".*update the installed quality-guard plugin/,
  );
});

test("two findings in one file stay two unless a merge group joins them", () => {
  const results = [
    { reviewer: "review-pr-feature", findings: [judgment(FIX, { severity: "MINOR" })] },
    { reviewer: "review-pr-design", findings: [judgment(UNICODE, { line: 1, slot: `file:${FIX}` })] },
    {
      reviewer: "review-pr-reliability",
      findings: [
        judgment(FIX, { severity: "BLOCKER", rootCause: "Stale filter reads outdated", slot: `file:${UNICODE}` }),
      ],
    },
  ];
  assert.deepEqual(review(results).counts, { BLOCKER: 1, MAJOR: 1, MINOR: 1 });
  const groups = [
    { members: ["J1", "J3"], representative: "J1" },
    { members: ["J2"], representative: "J2" },
  ];
  const { payload, counts } = review(results, { merge: { groups, scanner: [] } });
  assert.deepEqual(counts, { BLOCKER: 1, MAJOR: 1, MINOR: 0 });
  assert.match(payload.comments[0].body, /^\*\*BLOCKER\*\* Outdated threads are skipped/);
  assert.match(payload.comments[0].body, /\(review-pr-feature, review-pr-reliability\)$/);
  assert.equal(payload.comments[1].path, UNICODE);
});

test("every finding stays an inline comment so it gets a GH id", () => {
  const readme = judgment("README.md", { line: 92, rootCause: "stale readme", slot: `file:${FIX}` });
  const findings = [judgment(FIX, { line: 5 }), readme];
  const results = [{ reviewer: "review-pr-design", findings }];
  const { payload } = review(results);
  assert.deepEqual(
    payload.comments.map((comment) => [comment.path, comment.line]),
    [
      [FIX, 71],
      [FIX, 71],
    ],
  );
  assert.match(
    payload.comments[0].body,
    /Cited location: `plugins\/dod-guard\/skills\/fix-pr-review\/scripts\/lib\/fix-support\.mjs:5`/,
  );
  assert.match(payload.comments[1].body, /Cited location: `README\.md:92`/);
  assert.doesNotMatch(payload.body, /no added line/);
});

test("a clean review approves and carries the marker", () => {
  const { payload, recommendation } = review([]);
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

test("an empty diff or one written with other prefixes stops the build", () => {
  // diff.mnemonicPrefix writes c/ and w/ where the parser expects a/ and b/.
  const prefixed = diff
    .replaceAll("a/plugins", "c/plugins")
    .replaceAll("b/plugins", "w/plugins")
    .replaceAll('"a/', '"c/')
    .replaceAll('"b/', '"w/');
  const build = (text) => review([], { scan, diff: text });
  assert.throws(() => build(prefixed), /lacks the a\/ or b\/ prefix/);
  assert.throws(() => build(""), /names no changed files/);
});

test("posted comments read back as GH ids with their severity", () => {
  const comments = [
    {
      id: 41,
      pull_request_review_id: 7,
      path: FIX,
      line: 71,
      html_url: "a",
      body: "**MAJOR** quality-guard structural findings (2)",
    },
    {
      id: 42,
      pull_request_review_id: 7,
      path: FIX,
      line: 72,
      html_url: "b",
      body: "**BLOCKER** Outdated threads",
    },
    {
      id: 43,
      pull_request_review_id: 7,
      in_reply_to_id: 42,
      path: FIX,
      line: 72,
      body: "Fixed.",
    },
    {
      id: 44,
      pull_request_review_id: 8,
      path: FIX,
      line: 1,
      body: "**MINOR** other review",
    },
  ];
  assert.deepEqual(
    postedFindings(7, comments).map((finding) => [finding.id, finding.severity]),
    [
      ["GH-41", "MAJOR"],
      ["GH-42", "BLOCKER"],
    ],
  );
});
