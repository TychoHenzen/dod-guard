// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CAPS } from "../../../../lib/github-text.mjs";
import { scannerReview } from "./scanner-review.test-support.mjs";

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
  return scannerReview({ files, line: 10, violations, rule: keep });
}

function assertWithinCaps(review) {
  const { body, comments } = review.payload;
  assert.ok(body.length <= CAPS.reviewBody, `body is ${body.length} characters`);
  for (const comment of comments) {
    assert.ok(comment.body.length <= CAPS.reviewComment, `comment is ${comment.body.length} characters`);
  }
}

const listed = (body) => body.split("\n").filter((line) => line.startsWith("- ")).length;

// disc-golf PR #42: 557 kept violations rendered about 72,900 characters.
test("more than 557 kept violations in a few files stay within the caps", () => {
  const review = build({ fileCount: 8, perFile: 100 });
  assertWithinCaps(review);
  assert.deepEqual(review.counts, { BLOCKER: 0, MAJOR: 8, MINOR: 0 });
  // The five worst get a thread; the other three are listed as deferred.
  assert.equal(review.payload.comments.length, 5);
  assert.equal(review.deferred, 3);
  const [thread] = review.payload.comments;
  assert.match(thread.body, /By rule: `complexity` x25, `dead-export` x25, `duplicate-block` x25, 1 more\./);
  assert.equal(thread.body.split("\n").filter((line) => line.startsWith("- `")).length, 5);
  assert.match(thread.body, /\.\.\.and 95 more; run quality-guard on this file to list them\.$/);
});

test("many flagged files list the first fifteen and count the rest", () => {
  const review = build({ fileCount: 200, perFile: 3, high: false });
  assertWithinCaps(review);
  assert.equal(listed(review.payload.body), 15);
  assert.match(review.payload.body, /\n\n\.\.\.and 185 more findings, counted above and not listed\.$/);
});

// CardCleaner PR 490: 142 plan slots plus 30000 characters of scanner notes
// passed the limit, so a review of a large move could never post. The body no
// longer restates the plan, so long questions cost it nothing.
test("a plan with many long questions leaves the body the same size", () => {
  const { files, violations } = synthetic({ fileCount: 150, perFile: 3 });
  const ask = (file) => `Do the scanner violations listed for ${file} show at the reviewed head? ${"x".repeat(200)}`;
  const long = scannerReview({ files, line: 10, violations, rule: keep, ask });
  const short = scannerReview({ files, line: 10, violations, rule: keep });
  assertWithinCaps(long);
  assert.deepEqual([long.payload.comments.length, long.deferred], [5, 145]);
  assert.match(long.payload.body, /### Deferred findings/);
  assert.equal(long.payload.body, short.payload.body);
});

test("a small scanner review lists every finding and no overflow line", () => {
  const review = build({ fileCount: 2, perFile: 3, high: false });
  assert.equal(listed(review.payload.body), 2);
  assert.doesNotMatch(review.payload.body, /more findings, counted above/);
});
