import { requireCap } from "../../../../lib/github-text.mjs";
import { anchoredThreads } from "./anchor-findings.mjs";
import { splitFixThreads } from "./fix-threads.mjs";
import { groupBy } from "./group-by.mjs";
import { mergedFindings } from "./merge-groups.mjs";
import { requireMergeOutput } from "./merge-output.mjs";
import { regenerate } from "./regenerated-inputs.mjs";
import { requirePostableBody, reviewBody } from "./review-body.mjs";
import { scannerFinding } from "./scanner-findings.mjs";
import { splitRulings } from "./scanner-rulings.mjs";
import { widestLabelled } from "./visible-ids.mjs";

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

// Each field is clipped before the body is built, so the check only fires when
// a template changes. It measures the comment with the GH-<id> the label step
// adds after the post, so the edited comment fits too.
function inlineComments(blocking) {
  return blocking.map(({ anchored, body }) => {
    requireCap("reviewComment", widestLabelled(body), `The inline comment on ${anchored.path}:${anchored.line}`);
    return { ...anchored, body };
  });
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
  const body = reviewBody({
    headSha: input.headSha,
    recommendation,
    counts,
    threads: threads.length,
    deferred,
    minor: findings.filter((finding) => finding.severity === "MINOR"),
  });
  const payload = {
    commit_id: input.headSha,
    event: "COMMENT",
    body: requirePostableBody(body),
    comments: inlineComments(anchoredThreads(checked, threads)),
  };
  return { recommendation, counts, deferred: deferred.length, payload };
}

export { buildReview };
