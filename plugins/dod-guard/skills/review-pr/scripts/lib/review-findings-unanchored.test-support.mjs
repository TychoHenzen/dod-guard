import { complete, findingsFixture, judgment } from "./review-pr.test-support.mjs";
import { slotsByLens } from "./review-slots.mjs";

const { FIX, REVIEWERS, question } = findingsFixture;

// File headers with no hunk: the file is changed, but no line is added or
// removed, as for a mode-only change. No diff line can hold a thread on it.
const NO_LINES_DIFF = [`diff --git a/${FIX} b/${FIX}`, `--- a/${FIX}`, `+++ b/${FIX}`, ""].join("\n");

// One criterion slot, asked by every lens, with a single finding on it from
// the feature reviewer. The merge keeps that finding as its own group.
function unanchoredInputs(severity) {
  const asked = REVIEWERS.map((lens, index) => question(`C${index + 1}`, lens));
  const plan = [{ slot: "criterion:1", questions: asked }];
  const finding = judgment(FIX, { slot: "criterion:1", severity });
  const results = complete([{ reviewer: "review-pr-feature", findings: [finding] }], slotsByLens(plan));
  const merge = { groups: [{ members: ["J1"], representative: "J1" }], scanner: [] };
  return { plan, results, merge, diff: NO_LINES_DIFF };
}

export { NO_LINES_DIFF, unanchoredInputs };
