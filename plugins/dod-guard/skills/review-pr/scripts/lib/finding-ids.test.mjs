// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { judgedCandidates, scannerCandidates } from "./finding-ids.mjs";
import { complete, judgment } from "./review-pr.test-support.mjs";

const A = "src/a.mjs";
const B = "src/b.mjs";
// src/a.mjs adds lines 3 and 9; src/b.mjs adds line 1; src/c.mjs is not in the diff.
const CHANGED = new Map([
  [A, new Set([3, 9])],
  [B, new Set([1])],
]);
const violation = (fields) => ({ severity: "medium", ...fields });

// Listed out of order on purpose. "B-rule" sorts before "a-rule" by code unit
// but after it under localeCompare, so the expected order pins the comparison.
const SCAN = {
  violations: [
    violation({ file: B, line: 1, rule: "line-length", message: "line is 90 chars" }),
    violation({ file: "src\\a.mjs", line: 9, rule: "line-length", message: "85 chars" }),
    violation({ file: A, line: 40, rule: "complexity", message: "f() cyclomatic complexity 8" }),
    violation({ file: A, line: 9, rule: "a-rule", message: "second" }),
    violation({ file: A, line: 9, rule: "B-rule", message: "first" }),
    violation({ file: A, line: 5, rule: "line-length", message: "line 5 is not added" }),
    violation({ file: "src/c.mjs", line: 1, rule: "file-length", message: "not in the diff" }),
    violation({ file: A, line: 40, rule: "complexity", message: "e() cyclomatic complexity 7" }),
  ],
};

test("S ids follow file, line, rule, and message order and skip out-of-scope violations", () => {
  const ids = scannerCandidates(SCAN, CHANGED).map(({ id, file, line, rule, message }) => [
    id,
    `${file}:${line}`,
    rule,
    message,
  ]);
  assert.deepEqual(ids, [
    ["S1", "src/a.mjs:9", "B-rule", "first"],
    ["S2", "src/a.mjs:9", "a-rule", "second"],
    ["S3", "src/a.mjs:9", "line-length", "85 chars"],
    ["S4", "src/a.mjs:40", "complexity", "e() cyclomatic complexity 7"],
    ["S5", "src/a.mjs:40", "complexity", "f() cyclomatic complexity 8"],
    ["S6", "src/b.mjs:1", "line-length", "line is 90 chars"],
  ]);
});

test("an S candidate keeps the scanner severity and only the five scanner fields", () => {
  const long = violation({ file: B, line: 1, rule: "line-length", message: "long" });
  const extra = { ...long, severity: "high", fingerprint: "x" };
  assert.deepEqual(scannerCandidates({ violations: [extra] }, CHANGED), [
    { id: "S1", file: B, line: 1, rule: "line-length", severity: "high", message: "long" },
  ]);
});

test("an unknown scanner severity is refused even outside the diff", () => {
  const outside = violation({ file: "src/c.mjs", line: 1, rule: "line-length", message: "long" });
  const legacy = { violations: [{ ...outside, severity: "error" }] };
  const named = 'unknown severity "error" for src/c.mjs:1 (line-length); update the installed';
  assert.throws(
    () => scannerCandidates(legacy, CHANGED),
    (error) => error.message.includes(named),
  );
});

const ASSIGNED = new Map([
  ["review-pr-feature", new Set([`file:${A}`])],
  ["review-pr-design", new Set([`file:${A}`])],
  ["review-pr-reliability", new Set([`file:${A}`])],
  ["review-pr-hygiene", new Set([`file:${A}`])],
]);
const backslashed = judgment("src\\a.mjs", { problem: "feature 1" });
const RESULTS = [
  { reviewer: "review-pr-hygiene", findings: [judgment(A, { problem: "hygiene" })] },
  {
    reviewer: "review-pr-feature",
    findings: [backslashed, judgment(B, { problem: "feature 2", slot: `file:${A}` })],
  },
  { reviewer: "review-pr-reliability", findings: [judgment(A, { problem: "reliability" })] },
];

test("J ids follow the reviewer order, then each reviewer's own finding order", () => {
  // Reversed so the result array order cannot be what numbers the findings.
  const results = complete(RESULTS, ASSIGNED).reverse();
  const ids = judgedCandidates(results, ASSIGNED).map(({ id, reviewer, file, problem }) => [
    id,
    reviewer,
    file,
    problem,
  ]);
  assert.deepEqual(ids, [
    ["J1", "review-pr-feature", A, "feature 1"],
    ["J2", "review-pr-feature", B, "feature 2"],
    ["J3", "review-pr-reliability", A, "reliability"],
    ["J4", "review-pr-hygiene", A, "hygiene"],
  ]);
});

test("an id written into a finding or a scan entry never replaces the build's id", () => {
  const forged = [
    { reviewer: "review-pr-feature", findings: [judgment(A, { id: "J9" })] },
    { reviewer: "review-pr-hygiene", findings: [judgment(A, { id: "J1" })] },
  ];
  const judged = judgedCandidates(complete(forged, ASSIGNED), ASSIGNED);
  assert.deepEqual(
    judged.map(({ id }) => id),
    ["J1", "J2"],
  );
  const entry = violation({ file: B, line: 1, rule: "line-length", message: "long", id: "S9" });
  assert.equal(scannerCandidates({ violations: [entry] }, CHANGED)[0].id, "S1");
});

test("the same inputs give the same ids, whatever order the scan lists them in", () => {
  const results = complete(RESULTS, ASSIGNED);
  assert.deepEqual(judgedCandidates(results, ASSIGNED), judgedCandidates(results, ASSIGNED));
  const reversed = { violations: [...SCAN.violations].reverse() };
  assert.deepEqual(scannerCandidates(reversed, CHANGED), scannerCandidates(SCAN, CHANGED));
});
