// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { anchor, firstAnchor, requireAnchored } from "./anchor-findings.mjs";
import { buildReview, postedFindings } from "./review-findings.mjs";
import { complete, findingsFixture, judgment } from "./review-pr.test-support.mjs";
import { slotsByLens } from "./review-slots.mjs";

const { REVIEWERS, HEAD, PBI, FIX, question } = findingsFixture;

const finding = { severity: "MAJOR", file: "a.mjs", line: 600, body: "**MAJOR** x" };
const trimmed = { added: new Map([["a.mjs", new Set()]]), removed: new Map([["a.mjs", new Set([3, 4])]]) };

test("a file with only removed lines anchors on its nearest removed line, on the left side", () => {
  const placed = anchor(finding, trimmed, null);
  assert.deepEqual(placed.anchored, { path: "a.mjs", line: 4, side: "LEFT" });
  assert.match(placed.body, /Cited location: `a\.mjs:600`\. This PR only removes lines from this file/);
});

test("a file with added lines still anchors on its nearest added line, on the right side", () => {
  const lines = { added: new Map([["a.mjs", new Set([10, 20])]]), removed: trimmed.removed };
  const placed = anchor(finding, lines, null);
  assert.deepEqual(placed.anchored, { path: "a.mjs", line: 20, side: "RIGHT" });
  assert.match(placed.body, /which is outside the lines this PR changes\.$/);
});

test("a finding in a file the diff does not touch takes the fallback, and none leaves it unanchored", () => {
  const other = { ...finding, file: "b.mjs" };
  assert.deepEqual(anchor(other, trimmed, firstAnchor(trimmed)).anchored, { path: "a.mjs", line: 3, side: "LEFT" });
  assert.equal(anchor(other, trimmed, null).anchored, null);
  assert.match(anchor(other, trimmed, firstAnchor(trimmed)).body, /which is outside the lines this PR changes\.$/);
});

test("the first anchor prefers an added line over a removed one", () => {
  const lines = { added: new Map([["b.mjs", new Set([7])]]), removed: trimmed.removed };
  assert.deepEqual(firstAnchor(lines), { path: "b.mjs", line: 7, side: "RIGHT" });
  assert.equal(firstAnchor({ added: new Map(), removed: new Map() }), null);
});

test("a blocking finding without a line refuses, and a MINOR one does not", () => {
  const loose = { ...finding, anchored: null };
  const minor = { ...loose, severity: "MINOR" };
  assert.deepEqual(requireAnchored([minor]), [minor]);
  assert.throws(() => requireAnchored([loose, minor]), /1 BLOCKER or MAJOR finding\(s\): a\.mjs:600\. Nothing/);
});

test("the report names the side, because a left-side line number is a line of the base file", () => {
  const comment = { id: 9, pull_request_review_id: 7, body: "**MAJOR** x", path: "a.mjs" };
  const posted = postedFindings(7, [{ ...comment, line: null, original_line: 4, side: "LEFT" }]);
  assert.deepEqual(
    posted.map(({ id, line, side }) => [id, line, side]),
    [["GH-9", 4, "LEFT"]],
  );
});

const REMOVAL_ONLY = [`diff --git a/${FIX} b/${FIX}`, `--- a/${FIX}`, `+++ b/${FIX}`, "@@ -3,2 +3,0 @@", "-x", "-y"];

test("a judged BLOCKER anchors on a removed line when the diff adds none", () => {
  const plan = [{ slot: "criterion:1", questions: REVIEWERS.map((lens, index) => question(`C${index + 1}`, lens)) }];
  const findings = [judgment(FIX, { severity: "BLOCKER", line: 5, slot: "criterion:1" })];
  const results = complete([{ reviewer: "review-pr-feature", findings }], slotsByLens(plan));
  const merge = { groups: [{ members: ["J1"], representative: "J1" }], scanner: [] };
  const inputs = { headSha: HEAD, scan: { violations: [] }, diff: REMOVAL_ONLY.join("\n"), plan, pbi: PBI };
  const { payload, recommendation } = buildReview({ ...inputs, subIssues: [], results, merge });
  assert.equal(recommendation, "BLOCK");
  assert.deepEqual(
    payload.comments.map(({ path, line, side }) => [path, line, side]),
    [[FIX, 4, "LEFT"]],
  );
});
