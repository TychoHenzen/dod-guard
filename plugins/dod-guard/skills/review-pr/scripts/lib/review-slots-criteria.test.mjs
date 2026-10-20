// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { pbiJson } from "./review-pr.test-support.mjs";
import { pbiIssue, reviewSlots, subIssueList } from "./review-slots.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

// An empty diff is refused by reviewSlots, so the criterion slots need one changed file.
const DIFF = [
  "diff --git a/src/a.mjs b/src/a.mjs",
  "--- a/src/a.mjs",
  "+++ b/src/a.mjs",
  "@@ -0,0 +1 @@",
  "+x",
  "",
].join("\n");

function slotsFor(body) {
  return reviewSlots({
    changedLines: parseChangedLines(DIFF),
    pbi: pbiIssue(pbiJson({ body }), "pbi.json"),
    subIssues: subIssueList([], "sub-issues.json"),
  });
}

test("a criterion slot carries the item's nested sub-bullets", () => {
  const body = [
    "## Acceptance criteria",
    "",
    "- [ ] AC-01 first",
    "  - nested sub-bullet",
    "- [x] AC-02 second",
    "",
  ].join("\n");
  const criteria = slotsFor(body).filter((slot) => slot.kind === "criterion");
  assert.deepEqual(criteria, [
    { slot: "criterion:1", kind: "criterion", text: "AC-01 first\n  - nested sub-bullet" },
    { slot: "criterion:2", kind: "criterion", text: "AC-02 second" },
  ]);
});
