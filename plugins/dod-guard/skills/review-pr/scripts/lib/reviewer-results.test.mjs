// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { judgmentFindings } from "./reviewer-results.mjs";

const REVIEWERS = [
  "review-pr-feature",
  "review-pr-design",
  "review-pr-reliability",
  "review-pr-hygiene",
];
const FILE = "src/review.js";
const ASSIGNED = new Map([
  ["review-pr-feature", new Set(["file:src/review.js", "criterion:1"])],
  ["review-pr-design", new Set(["file:src/review.js"])],
  ["review-pr-reliability", new Set(["file:src/review.js"])],
  ["review-pr-hygiene", new Set(["sub-issue:o/r#5"])],
]);
const rulings = (reviewer) =>
  [...ASSIGNED.get(reviewer)].map((slot) => ({ slot, status: "VERIFIED", evidence: "ok" }));

function judgment(overrides) {
  return {
    severity: "MAJOR",
    file: FILE,
    line: 72,
    problem: "Outdated threads are skipped",
    impact: "Real findings are never fixed",
    requirement: "AC 2",
    correction: "Keep outdated threads open",
    rootCause: "Outdated treated as stale",
    evidence: "review.js:72 sets stale",
    ...overrides,
  };
}

function complete(results) {
  return REVIEWERS.map((reviewer) => ({
    reviewer,
    rulings: rulings(reviewer),
    findings: [],
    ...results.find((result) => result.reviewer === reviewer),
  }));
}

test("four clean reviewers produce no findings", () => {
  assert.deepEqual(judgmentFindings(complete([]), ASSIGNED), []);
});

test("a missing reviewer or envelope fails instead of reading as clean", () => {
  assert.throws(
    () => judgmentFindings([], ASSIGNED),
    /Incomplete reviewer results[\s\S]*review-pr-feature: expected one result/,
  );
  const noRulings = complete([]).map((result) =>
    result.reviewer === "review-pr-design" ? { ...result, rulings: undefined } : result,
  );
  assert.throws(
    () => judgmentFindings(noRulings, ASSIGNED),
    /review-pr-design: needs a findings array and a rulings array/,
  );
  const twice = [
    ...complete([]),
    { reviewer: "review-pr-hygiene", rulings: rulings("review-pr-hygiene"), findings: [] },
  ];
  assert.throws(() => judgmentFindings(twice, ASSIGNED), /got 2/);
  assert.throws(() => judgmentFindings({}, ASSIGNED), /must be a JSON array/);
});

test("a missing ruling names the reviewer and slot", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      rulings: [{ slot: "file:src/review.js", status: "VERIFIED", evidence: "ok" }],
    },
  ];
  assert.throws(
    () => judgmentFindings(complete(results), ASSIGNED),
    /review-pr-feature: missing ruling for slot criterion:1/,
  );
});

test("a ruling for a slot not assigned to the lens is refused", () => {
  const results = [
    {
      reviewer: "review-pr-design",
      rulings: [
        ...rulings("review-pr-design"),
        { slot: "criterion:1", status: "VERIFIED", evidence: "ok" },
      ],
    },
  ];
  assert.throws(
    () => judgmentFindings(complete(results), ASSIGNED),
    /review-pr-design: ruling for slot "criterion:1" is not assigned to this lens/,
  );
});

test("a duplicate ruling is refused", () => {
  const results = [
    {
      reviewer: "review-pr-reliability",
      rulings: [...rulings("review-pr-reliability"), ...rulings("review-pr-reliability")],
    },
  ];
  assert.throws(
    () => judgmentFindings(complete(results), ASSIGNED),
    /review-pr-reliability: duplicate ruling for slot file:src\/review\.js/,
  );
});

test("an unknown ruling status is refused", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      rulings: [
        { slot: "file:src/review.js", status: "PASS", evidence: "ok" },
        { slot: "criterion:1", status: "VERIFIED", evidence: "ok" },
      ],
    },
  ];
  assert.throws(
    () => judgmentFindings(complete(results), ASSIGNED),
    /review-pr-feature: unknown status "PASS" for slot file:src\/review\.js/,
  );
});

test("a ruling without evidence is refused", () => {
  const results = [
    {
      reviewer: "review-pr-feature",
      rulings: [
        { slot: "file:src/review.js", status: "VERIFIED", evidence: " " },
        { slot: "criterion:1", status: "VERIFIED", evidence: "ok" },
      ],
    },
  ];
  assert.throws(
    () => judgmentFindings(complete(results), ASSIGNED),
    /review-pr-feature: ruling for slot file:src\/review\.js needs evidence/,
  );
});

test("an excluded slot is assigned to the lens its exclusion names", () => {
  assert.doesNotThrow(() => judgmentFindings(complete([]), ASSIGNED));
  const results = [{ reviewer: "review-pr-hygiene", rulings: [] }];
  assert.throws(
    () => judgmentFindings(complete(results), ASSIGNED),
    /review-pr-hygiene: missing ruling for slot sub-issue:o\/r#5/,
  );
});

test("a finding without a required field or an integer line fails", () => {
  const blank = [{ reviewer: "review-pr-hygiene", findings: [judgment({ correction: " " })] }];
  assert.throws(
    () => judgmentFindings(complete(blank), ASSIGNED),
    /review-pr-hygiene returned a finding without correction/,
  );
  const { line: _line, ...lineless } = judgment({});
  const noLine = [{ reviewer: "review-pr-feature", findings: [lineless] }];
  assert.throws(
    () => judgmentFindings(complete(noLine), ASSIGNED),
    /review-pr-feature returned a finding without line/,
  );
});

test("one root cause in one file keeps the highest severity and its reviewer", () => {
  const results = [
    { reviewer: "review-pr-feature", findings: [judgment({ severity: "MINOR" })] },
    {
      reviewer: "review-pr-reliability",
      findings: [judgment({ severity: "BLOCKER", rootCause: "outdated  treated as STALE" })],
    },
    { reviewer: "review-pr-design", findings: [judgment({ file: "src/other.js" })] },
  ];
  const findings = judgmentFindings(complete(results), ASSIGNED);
  assert.deepEqual(
    findings.map((finding) => [finding.file, finding.severity]),
    [
      [FILE, "BLOCKER"],
      ["src/other.js", "MAJOR"],
    ],
  );
  assert.match(findings[0].body, /\(review-pr-reliability\)$/);
});
