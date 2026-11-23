import { anchoredThreads } from "./anchor-findings.mjs";
import { droppedBlock } from "./dropped-block.mjs";
import { splitFixThreads } from "./fix-threads.mjs";
import { groupBy } from "./group-by.mjs";
import { mergedFindings } from "./merge-groups.mjs";
import { requireMergeOutput } from "./merge-output.mjs";
import { regenerate } from "./regenerated-inputs.mjs";
import { fittedBody, requirePostableBody } from "./review-body.mjs";
import { slotsBlock } from "./review-slots.mjs";
import { scannerFinding, taggedGroups } from "./scanner-findings.mjs";
import { splitRulings } from "./scanner-rulings.mjs";
import { fullListComments } from "./scanner-summary.mjs";

// MINOR findings never block: one review on PR #901 posted 21 of them, and
// fixing and answering each one cost more than the findings were worth.
function recommendationFor(severities) {
  if (severities.includes("BLOCKER")) {
    return "BLOCK";
  }
  if (severities.includes("MAJOR")) {
    return "REQUEST_CHANGES";
  }
  return "APPROVE";
}

function countSeverities(findings) {
  const counts = { BLOCKER: 0, MAJOR: 0, MINOR: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

// The build regenerates the slots and both id sets instead of trusting lists
// the planner or the merge pass returns, then checks the pass output against
// them before anything is built.
function checkedInputs(input) {
  const { judged, scanner, ...regenerated } = regenerate(input);
  requireMergeOutput(input.merge, { judged, scanner, plan: input.plan });
  return { ...regenerated, judged, ...splitRulings(input.merge.scanner, scanner, input.plan) };
}

// Only kept violations reach scannerFinding, so a dropped one never sets a
// file's severity or shows in the counts.
function reviewFindings({ judged, kept }, merge) {
  const groups = [...groupBy(kept, "file")].map(([file, group]) => scannerFinding(file, group));
  return [...mergedFindings(merge.groups, judged), ...groups];
}

function planBlocks(plan, { slots, dropped }) {
  return [slotsBlock(plan, slots), droppedBlock(dropped)].filter(Boolean).join("\n\n");
}

function inlineComments(blocking) {
  return blocking.map(({ anchored, body }) => ({ ...anchored, body }));
}

function buildReview(input) {
  const checked = checkedInputs(input);
  const findings = reviewFindings(checked, input.merge);
  // Only the worst blocking findings become inline threads, so only they get a
  // GH-<id> that a caller can pass to /fix-pr-review. The counts still name
  // every finding, deferred ones included.
  const { threads, deferred } = splitFixThreads(findings);
  const recommendation = recommendationFor(threads.map((finding) => finding.severity));
  const counts = countSeverities(findings);
  const parts = { headSha: input.headSha, recommendation, counts, block: planBlocks(input.plan, checked) };
  // A scanner group is shown short when it has more violations than the body
  // shows, or when it is deferred to one line. Either way the scanner comments
  // carry its full list.
  const { body, listed } = fittedBody(parts, {
    deferred,
    minor: findings.filter((finding) => finding.severity === "MINOR"),
    summarized: findings.some((finding) => finding.truncated) || deferred.some((finding) => finding.scanner),
  });
  const payload = {
    commit_id: input.headSha,
    event: "COMMENT",
    body: requirePostableBody(body, checked.slots.length),
    comments: inlineComments(anchoredThreads(checked, threads)),
  };
  const scannerComments = listed ? fullListComments(input.headSha, taggedGroups(checked.kept)) : [];
  return { recommendation, counts, deferred: deferred.length, payload, scannerComments };
}

export { buildReview };
