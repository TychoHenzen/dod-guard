// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { buildReview } from "./review-findings.mjs";
import { unanchoredInputs } from "./review-findings-unanchored.test-support.mjs";
import { findingsFixture } from "./review-pr.test-support.mjs";

const { HEAD, PBI } = findingsFixture;
const build = (severity) =>
  buildReview({ headSha: HEAD, scan: { violations: [] }, pbi: PBI, subIssues: [], ...unanchoredInputs(severity) });
const refusal =
  /No diff line can hold an inline comment for 1 BLOCKER or MAJOR finding\(s\): .*:72\. Nothing was posted/;

test("buildReview refuses a MAJOR finding when the diff has no line to hold it", () => {
  assert.throws(() => build("MAJOR"), refusal);
});

test("buildReview refuses a BLOCKER finding when the diff has no line to hold it", () => {
  assert.throws(() => build("BLOCKER"), refusal);
});

test("buildReview still builds a MINOR finding when the diff has no line", () => {
  const { payload, recommendation } = build("MINOR");
  assert.equal(recommendation, "APPROVE");
  assert.deepEqual(payload.comments, []);
});
