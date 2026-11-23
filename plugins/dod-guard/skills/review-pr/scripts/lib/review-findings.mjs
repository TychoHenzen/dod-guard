import { anchor, firstAnchor, requireAnchored } from "./anchor-findings.mjs";
import { droppedBlock } from "./dropped-block.mjs";
import { splitFixThreads } from "./fix-threads.mjs";
import { groupBy } from "./group-by.mjs";
import { mergedFindings } from "./merge-groups.mjs";
import { requireMergeOutput } from "./merge-output.mjs";
import { regenerate } from "./regenerated-inputs.mjs";
import { fittedBody, MARKER, requirePostableBody } from "./review-body.mjs";
import { slotsBlock } from "./review-slots.mjs";
import { splitRulings } from "./scanner-rulings.mjs";
import { fullListComments, SHOWN, scannerBody } from "./scanner-summary.mjs";

const SEVERITY_PREFIX = /^\*\*(BLOCKER|MAJOR|MINOR)\*\*/;

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

function scannerFinding(file, violations) {
  const sorted = [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
  const severity = sorted.some((violation) => violation.severity === "high") ? "MAJOR" : "MINOR";
  return {
    severity,
    file,
    line: sorted[0].line,
    body: scannerBody(severity, sorted),
    scanner: true,
    truncated: sorted.length > SHOWN,
  };
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

// Only kept violations reach the unchanged scannerFinding, so a dropped one
// never sets a file's severity or shows in the counts.
function reviewFindings({ judged, kept }, merge) {
  const groups = [...groupBy(kept, "file")].map(([file, group]) => scannerFinding(file, group));
  return [...mergedFindings(merge.groups, judged), ...groups];
}

// Only a finding that gets a thread needs a diff line, so the caller cuts the
// deferred ones first and a deferred finding never refuses the build.
//
// A scanner group describes its own file, so it never takes the cross-file
// fallback: a file the PR only trims anchors on one of its removed lines.
// Only a judged finding can cite a file outside the diff by design.
//
// A thread that still has no line refuses the build. Scanner groups are never
// BLOCKER and rank after judged findings, so listing them last keeps the order.
function anchoredThreads({ changedLines, removedLines }, threads) {
  const lines = { added: changedLines, removed: removedLines };
  const fallback = firstAnchor(lines);
  const judged = threads.filter((finding) => !finding.scanner).map((finding) => anchor(finding, lines, fallback));
  const groups = threads.filter((finding) => finding.scanner).map((finding) => anchor(finding, lines, null));
  return requireAnchored([...judged, ...groups]);
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
  const scannerComments = listed ? fullListComments(input.headSha, groupBy(checked.kept, "file")) : [];
  return { recommendation, counts, deferred: deferred.length, payload, scannerComments };
}

function existingReview(reviews) {
  for (const review of reviews) {
    const match = review.body?.match(MARKER);
    if (match) {
      return {
        found: true,
        reviewId: review.id,
        headSha: match[1],
        recommendation: match[2],
        url: review.html_url,
      };
    }
  }
  return { found: false };
}

function postedFindings(reviewId, reviewComments) {
  return reviewComments
    .filter((comment) => comment.pull_request_review_id === reviewId && !comment.in_reply_to_id)
    .map((comment) => ({
      id: `GH-${comment.id}`,
      severity: comment.body.match(SEVERITY_PREFIX)?.[1] ?? "MINOR",
      file: comment.path,
      line: comment.line ?? comment.original_line,
      side: comment.side,
      url: comment.html_url,
    }));
}

export { buildReview, existingReview, postedFindings };
