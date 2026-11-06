import { judgedCandidates, scannerCandidates } from "./finding-ids.mjs";
import { requirePlan, reviewSlots, slotsByLens } from "./review-slots.mjs";
import { requireScannerQuestions } from "./scanner-plan.mjs";
import { parseDiffLines } from "./unified-diff.mjs";

// The build and the candidates command both regenerate ids from the saved
// inputs, so they share this one path and cannot disagree about an id.
function regenerate({ scan, diff, pbi, subIssues, plan, results }) {
  const { added: changedLines, removed: removedLines } = parseDiffLines(diff);
  const slots = reviewSlots({ changedLines, pbi, subIssues });
  requirePlan(plan, slots);
  const judged = judgedCandidates(results, slotsByLens(plan));
  const scanner = scannerCandidates(scan, changedLines);
  requireScannerQuestions(plan, scanner);
  return { changedLines, removedLines, slots, judged, scanner };
}

export { regenerate };
