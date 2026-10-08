// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  buildReview,
  existingReview,
  postedFindings,
} from "./review-findings.mjs";

const HEAD = "f522da2baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FIX =
  "plugins/dod-guard/skills/fix-pr-review/scripts/lib/fix-support.mjs";
const OTHER = "packages/unrelated/src/index.ts";
const UNICODE = "docs/ü.md";

// Violation shapes copied from a whole-repository quality_scan of PR #826
// (Windows separators included).
const scan = {
  violations: [
    {
      file: FIX.replaceAll("/", "\\"),
      line: 72,
      rule: "line-length",
      severity: "high",
      message: "line is 132 chars",
    },
    {
      file: FIX,
      line: 5,
      rule: "line-length",
      severity: "medium",
      message: "line is 85 chars",
    },
    {
      file: FIX,
      line: 58,
      rule: "complexity",
      severity: "medium",
      message: "reviewThreadNodes() cyclomatic complexity 10",
    },
    {
      file: OTHER,
      line: 3,
      rule: "dead-export",
      severity: "high",
      message: "x is exported but never referenced anywhere",
    },
    {
      file: UNICODE,
      line: 1,
      rule: "file-length",
      severity: "medium",
      message: "file is 600 lines",
    },
  ],
};
// The second file arrives the way Git writes it with core.quotePath=true.
const diff = [
  `diff --git a/${FIX} b/${FIX}`,
  `--- a/${FIX}`,
  `+++ b/${FIX}`,
  "@@ -70,0 +71,3 @@",
  "+a",
  "+b",
  "+c",
  'diff --git "a/docs/\\303\\274.md" "b/docs/\\303\\274.md"',
  '--- "a/docs/\\303\\274.md"',
  '+++ "b/docs/\\303\\274.md"',
  "@@ -1 +1 @@",
  "-old",
  "+new",
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

const REVIEWERS = [
  "review-pr-feature",
  "review-pr-design",
  "review-pr-reliability",
  "review-pr-hygiene",
];
const COVERAGE = [
  { requirement: "AC 1", status: "VERIFIED", evidence: "checked" },
];

// Fills in the reviewers a test does not care about, each with a clean,
// complete envelope.
function complete(results) {
  return REVIEWERS.map((reviewer) => ({
    reviewer,
    coverage: COVERAGE,
    findings: [],
    ...results.find((result) => result.reviewer === reviewer),
  }));
}

function review(results, scanInput = { violations: [] }) {
  return buildReview({
    headSha: HEAD,
    scan: scanInput,
    diff,
    results: complete(results),
  });
}

test("structural rules cover the whole touched file and line rules only the changed lines", () => {
  const { payload } = review([], scan);
  const fix = payload.comments.find((comment) => comment.path === FIX);
  assert.match(
    fix.body,
    /^\*\*MAJOR\*\* quality-guard structural findings \(2\)/,
  );
  assert.match(fix.body, /`complexity` line 58[\s\S]*`line-length` line 72/);
  assert.doesNotMatch(fix.body, /line 5:/);
  assert.equal(fix.line, 71);
  assert.doesNotMatch(JSON.stringify(payload), /dead-export/);
});

test("a changed file Git quotes in the diff still gets its scanner findings", () => {
  const { payload } = review([], scan);
  const unicode = payload.comments.find((comment) => comment.path === UNICODE);
  assert.deepEqual(
    [unicode.line, unicode.body.split("\n")[0]],
    [1, "**MINOR** quality-guard structural findings (1)"],
  );
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
  const { payload } = review([], lowOnly);
  const unicode = payload.comments.find((comment) => comment.path === UNICODE);
  assert.equal(
    unicode.body.split("\n")[0],
    "**MINOR** quality-guard structural findings (1)",
  );
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
    () => review([], legacy),
    /unknown severity "error".*update the installed quality-guard plugin/,
  );
});

test("the same root cause dedupes within a file but stays separate across files", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      findings: [judgment({ severity: "MINOR" })],
    },
    {
      reviewer: "review-pr-reliability",
      findings: [
        judgment({
          severity: "BLOCKER",
          rootCause: "outdated  treated as STALE",
        }),
      ],
    },
    {
      reviewer: "review-pr-design",
      findings: [judgment({ file: UNICODE, line: 1 })],
    },
  ];
  const { payload, recommendation, counts } = review(results);
  assert.equal(recommendation, "BLOCK");
  assert.deepEqual(counts, { BLOCKER: 1, MAJOR: 1, MINOR: 0 });
  assert.match(
    payload.comments[0].body,
    /^\*\*BLOCKER\*\* Outdated threads are skipped[\s\S]*\(review-pr-reliability\)/,
  );
  assert.equal(payload.comments[1].path, UNICODE);
});

test("every finding stays an inline comment so it gets a GH id", () => {
  const results = [
    {
      reviewer: "review-pr-design",
      findings: [
        judgment({ line: 5 }),
        judgment({ file: "README.md", line: 92, rootCause: "stale readme" }),
      ],
    },
  ];
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
  assert.deepEqual(
    [payload.event, payload.commit_id, payload.comments],
    ["COMMENT", HEAD, []],
  );
  assert.deepEqual(
    existingReview([{ id: 9, body: payload.body, html_url: "u" }]),
    {
      found: true,
      reviewId: 9,
      headSha: HEAD,
      recommendation: "APPROVE",
      url: "u",
    },
  );
  assert.deepEqual(existingReview([{ id: 1, body: "LGTM" }]), { found: false });
});

test("an empty diff or one written with other prefixes stops the build", () => {
  // diff.mnemonicPrefix writes c/ and w/ where the parser expects a/ and b/.
  const prefixed = diff
    .replaceAll("a/plugins", "c/plugins")
    .replaceAll("b/plugins", "w/plugins")
    .replaceAll('"a/', '"c/')
    .replaceAll('"b/', '"w/');
  const build = (text) =>
    buildReview({ headSha: HEAD, scan, diff: text, results: complete([]) });
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
    postedFindings(7, comments).map((finding) => [
      finding.id,
      finding.severity,
    ]),
    [
      ["GH-41", "MAJOR"],
      ["GH-42", "BLOCKER"],
    ],
  );
});
