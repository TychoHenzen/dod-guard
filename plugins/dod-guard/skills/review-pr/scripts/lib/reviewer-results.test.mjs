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
const COVERAGE = [{ requirement: "AC 1", status: "VERIFIED", evidence: "ok" }];
const FILE = "src/review.js";

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
    coverage: COVERAGE,
    findings: [],
    ...results.find((result) => result.reviewer === reviewer),
  }));
}

test("four clean reviewers produce no findings", () => {
  assert.deepEqual(judgmentFindings(complete([])), []);
});

test("a missing reviewer or envelope fails instead of reading as clean", () => {
  assert.throws(
    () => judgmentFindings([]),
    /Incomplete reviewer results[\s\S]*review-pr-feature: expected one result/,
  );
  const noCoverage = complete([]).map((result) =>
    result.reviewer === "review-pr-design" ? { ...result, coverage: [] } : result,
  );
  assert.throws(
    () => judgmentFindings(noCoverage),
    /review-pr-design: needs a findings array and a non-empty coverage array/,
  );
  const twice = [
    ...complete([]),
    { reviewer: "review-pr-hygiene", coverage: COVERAGE, findings: [] },
  ];
  assert.throws(() => judgmentFindings(twice), /got 2/);
});

test("a finding without a required field or an integer line fails", () => {
  const blank = [{ reviewer: "review-pr-hygiene", findings: [judgment({ correction: " " })] }];
  assert.throws(
    () => judgmentFindings(complete(blank)),
    /review-pr-hygiene returned a finding without correction/,
  );
  const { line: _line, ...lineless } = judgment({});
  const noLine = [{ reviewer: "review-pr-feature", findings: [lineless] }];
  assert.throws(
    () => judgmentFindings(complete(noLine)),
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
  const findings = judgmentFindings(complete(results));
  assert.deepEqual(
    findings.map((finding) => [finding.file, finding.severity]),
    [
      [FILE, "BLOCKER"],
      ["src/other.js", "MAJOR"],
    ],
  );
  assert.match(findings[0].body, /\(review-pr-reliability\)$/);
});
