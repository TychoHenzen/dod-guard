// Shared by the review-pr test files. The name does not match the test glob
// (*.test.mjs), so the runner never loads it as a test file.

import { buildReview } from "./review-findings.mjs";

export const REPO_URL = "https://api.github.com/repos/TychoHenzen/dod-guard";

// The six diff lines Git writes for a docs file with a non-ASCII name, with
// core.quotePath=true.
export const QUOTED_PATH_HUNK = [
  'diff --git "a/docs/\\303\\274.md" "b/docs/\\303\\274.md"',
  '--- "a/docs/\\303\\274.md"',
  '+++ "b/docs/\\303\\274.md"',
  "@@ -1 +1 @@",
  "-old",
  "+new",
];

// Spelled out here rather than imported, so a wrong production list cannot
// also shape the fixtures that are meant to catch it.
const LENSES = ["feature", "design", "reliability", "hygiene"];
const REVIEWERS = LENSES.map((lens) => `review-pr-${lens}`);

// The finding the reviewer-result tests build. The file is required because
// each test file reviews a different diff; nothing asserts the evidence text.
export function judgment(file, overrides = {}) {
  return {
    severity: "MAJOR",
    file,
    line: 72,
    problem: "Outdated threads are skipped",
    impact: "Real findings are never fixed",
    requirement: "AC 2",
    correction: "Keep outdated threads open",
    rootCause: "Outdated treated as stale",
    evidence: "line 72 sets stale",
    ...overrides,
  };
}

// Fills in the reviewers a test does not care about, each with a clean
// envelope ruling on every slot that `assigned` (lens -> Set of slots, the
// shape production builds) gives it.
export function complete(results, assigned) {
  const verified = (slot) => ({ slot, status: "VERIFIED", evidence: "ok" });
  return REVIEWERS.map((reviewer) => ({
    reviewer,
    rulings: [...assigned.get(reviewer)].map(verified),
    findings: [],
    ...results.find((result) => result.reviewer === reviewer),
  }));
}

// The PBI issue JSON. The two checkbox decoys sit under Outcome and
// Verification, outside the acceptance criteria. A fresh object each call.
export function pbiJson(overrides = {}) {
  return {
    number: 837,
    repository_url: REPO_URL,
    body: [
      "## Outcome",
      "",
      "- [ ] not a criterion",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] AC-01 first",
      "- [x] AC-02 second",
      "",
      "## Verification",
      "",
      "- [ ] not a criterion",
      "",
    ].join("\n"),
    ...overrides,
  };
}

const HEAD = "f522da2baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FIX = "plugins/dod-guard/skills/fix-pr-review/scripts/lib/fix-support.mjs";
const OTHER = "packages/unrelated/src/index.ts";
const UNICODE = "docs/\u00fc.md";

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
  ...QUOTED_PATH_HUNK,
].join("\n");

const PBI = {
  repository: "TychoHenzen/dod-guard",
  number: 837,
  body: "## Acceptance criteria\n\n- [ ] AC-01 The review posts once\n",
};
const SUB_ISSUES = [{ repository: "TychoHenzen/dod-guard", number: 900, title: "Child" }];
const SUB_SLOT = "sub-issue:TychoHenzen/dod-guard#900";
const question = (id, lens) => ({
  id,
  lens,
  question: `Does ${lens} hold at the reviewed head?`,
  files: [FIX],
  status: "verified",
});
const PLAN = [
  {
    slot: `file:${FIX}`,
    questions: [question("F1", "review-pr-feature"), question("D1", "review-pr-design")],
  },
  {
    slot: `file:${UNICODE}`,
    questions: [question("R1", "review-pr-reliability")],
  },
  { slot: "criterion:1", questions: [question("F2", "review-pr-feature")] },
  {
    slot: SUB_SLOT,
    excluded: { lens: "review-pr-hygiene", reason: "Same work as criterion:1" },
  },
];
const ASSIGNED = new Map([
  ["review-pr-feature", new Set([`file:${FIX}`, "criterion:1"])],
  ["review-pr-design", new Set([`file:${FIX}`])],
  ["review-pr-reliability", new Set([`file:${UNICODE}`])],
  ["review-pr-hygiene", new Set([SUB_SLOT])],
]);

// Every build starts from the clean fixture with no violations; a test
// overrides only the input it is about, so a refusal traces to that input.
function review(results, overrides = {}) {
  const clean = { headSha: HEAD, scan: { violations: [] }, diff, plan: PLAN, pbi: PBI };
  const reviewed = { ...clean, subIssues: SUB_ISSUES, results: complete(results, ASSIGNED) };
  return buildReview({ ...reviewed, ...overrides });
}

// The review-findings test files share one diff, plan, and PBI. One object
// keeps the shared surface to a single test-only export.
export const findingsFixture = {
  HEAD,
  FIX,
  UNICODE,
  SUB_SLOT,
  PBI,
  PLAN,
  scan,
  diff,
  question,
  review,
};
