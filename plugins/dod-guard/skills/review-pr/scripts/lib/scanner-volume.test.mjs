// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { scannerReview } from "./scanner-review.test-support.mjs";

const LIMIT = 65_536;
const RULES = ["function-length", "complexity", "duplicate-block", "dead-export"];
const keep = (ids) => ({ ids, status: "KEEP" });

function synthetic({ fileCount, perFile, high = true }) {
  const files = Array.from({ length: fileCount }, (_, index) => `tests/volume/case-${index}.test.mjs`);
  const violations = files.flatMap((file, fileIndex) =>
    Array.from({ length: perFile }, (_, index) => ({
      file,
      line: 10 + index,
      rule: RULES[(fileIndex + index) % RULES.length],
      severity: high && index % 4 === 0 ? "high" : "medium",
      message: `case${fileIndex}_${index}() is too long to read in one pass, split it into named steps`,
    })),
  );
  return { files, violations };
}

function build(options) {
  const { files, violations } = synthetic(options);
  const review = scannerReview({ files, line: 10, violations, rule: keep });
  return { review, violations };
}

function assertFullListReachable({ review, violations }) {
  const parts = review.scannerComments.map(({ body }) => body);
  assert.ok(parts.length > 0, "a summarized review needs scanner comments");
  for (const [index, part] of parts.entries()) {
    assert.ok(part.length < LIMIT, `part ${index + 1} is ${part.length} characters`);
    assert.match(
      part,
      new RegExp(`^<!-- dod-guard:review-pr-scanner head=[0-9a-f]+ part=${index + 1}/${parts.length} -->`),
    );
  }
  const text = parts.join("\n");
  for (const violation of violations) {
    const item = `- \`${violation.rule}\` line ${violation.line}: ${violation.message}`;
    assert.ok(text.includes(item), `missing ${item}`);
  }
  assert.match(review.payload.body, /headed `dod-guard scanner findings`/);
}

// disc-golf PR #42: 557 kept violations rendered about 72,900 characters.
test("more than 557 kept violations in a few files keep the body postable and the list reachable", () => {
  const result = build({ fileCount: 8, perFile: 100 });
  assert.ok(result.violations.length > 557, "need more violations than disc-golf PR 42");
  assert.ok(result.review.payload.body.length < LIMIT, `body is ${result.review.payload.body.length} characters`);
  assert.deepEqual(result.review.counts, { BLOCKER: 0, MAJOR: 8, MINOR: 0 });
  assert.equal(result.review.payload.comments.length, 8);
  assert.match(result.review.payload.comments[0].body, /By severity: medium x75, high x25\./);
  assertFullListReachable(result);
});

test("many flagged files stay under the body budget and name the omitted ones", () => {
  const result = build({ fileCount: 200, perFile: 3, high: false });
  assert.ok(result.review.payload.body.length < LIMIT, `body is ${result.review.payload.body.length} characters`);
  assert.match(
    result.review.payload.body,
    /\d+ more files have scanner findings, listed only in the scanner findings comments\./,
  );
  assertFullListReachable(result);
});

test("a small scanner review posts no scanner comments", () => {
  const result = build({ fileCount: 2, perFile: 3 });
  assert.deepEqual(result.review.scannerComments, []);
  assert.doesNotMatch(result.review.payload.body, /scanner findings comments/);
});
