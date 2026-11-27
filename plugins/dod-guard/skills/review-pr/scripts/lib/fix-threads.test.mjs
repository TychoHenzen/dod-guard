// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { findingsFixture, judgment } from "./review-pr.test-support.mjs";

const { FIX, SUB_SLOT, review } = findingsFixture;

// Findings that differ only in their problem text, so a test can tell which ones got a thread.
const numbered = (count, overrides) =>
  Array.from({ length: count }, (_, index) =>
    judgment(FIX, { problem: `Problem ${index + 1}`, rootCause: `cause ${index + 1}`, ...overrides }),
  );
const threadProblems = (payload) => payload.comments.map((comment) => comment.body.split("\n")[0]);

test("only the five worst MAJOR findings get a thread; the rest are listed as deferred", () => {
  const results = [{ reviewer: "review-pr-design", findings: numbered(7, {}) }];
  const { payload, recommendation, counts, deferred } = review(results);
  assert.equal(recommendation, "REQUEST_CHANGES");
  assert.deepEqual(counts, { BLOCKER: 0, MAJOR: 7, MINOR: 0 });
  assert.equal(deferred, 2);
  assert.deepEqual(
    threadProblems(payload),
    [1, 2, 3, 4, 5].map((n) => `**MAJOR** Problem ${n}`),
  );
  assert.match(payload.body, /### Deferred findings\n\nOnly the 5 worst findings get a thread\. These need no reply\./);
  // A deferred finding is one line: severity, location, and its problem as the headline.
  assert.match(payload.body, /\n- MAJOR `[^`]*fix-support\.mjs:72` Problem 6\n- MAJOR `[^`]*fix-support\.mjs:72` Problem 7$/);
  assert.doesNotMatch(payload.body, /Impact: /);
});

test("every BLOCKER keeps its thread even past the cap", () => {
  const results = [{ reviewer: "review-pr-design", findings: numbered(6, { severity: "BLOCKER" }) }];
  const { payload, recommendation, deferred } = review(results);
  assert.equal(recommendation, "BLOCK");
  assert.equal(payload.comments.length, 6);
  assert.equal(deferred, 0);
  assert.doesNotMatch(payload.body, /### Deferred findings/);
});

test("a BLOCKER outranks a MAJOR, and a feature finding outranks a hygiene one", () => {
  const hygiene = numbered(5, { slot: SUB_SLOT });
  const results = [
    { reviewer: "review-pr-hygiene", findings: hygiene },
    { reviewer: "review-pr-design", findings: [judgment(FIX, { severity: "BLOCKER", problem: "Data loss" })] },
    { reviewer: "review-pr-feature", findings: [judgment(FIX, { problem: "AC 2 is missing", rootCause: "x" })] },
  ];
  const { payload } = review(results);
  assert.deepEqual(threadProblems(payload), [
    "**BLOCKER** Data loss",
    "**MAJOR** AC 2 is missing",
    "**MAJOR** Problem 1",
    "**MAJOR** Problem 2",
    "**MAJOR** Problem 3",
  ]);
  assert.match(payload.body, /- MAJOR `[^`]*` Problem 4\n- MAJOR `[^`]*` Problem 5$/);
});

test("a judged MAJOR outranks a scanner MAJOR, which is deferred past the cap", () => {
  const scan = {
    violations: [{ file: FIX, line: 72, rule: "line-length", severity: "high", message: "line is 132 chars" }],
  };
  const results = [{ reviewer: "review-pr-design", findings: numbered(5, {}) }];
  const { payload, deferred } = review(results, { scan });
  assert.equal(deferred, 1);
  assert.ok(payload.comments.every((comment) => !comment.body.includes("quality-guard")));
  assert.match(payload.body, /### Deferred findings[\s\S]*\n- MAJOR `[^`]*fix-support\.mjs:72` 1 quality-guard finding: `line-length` x1$/);
});
