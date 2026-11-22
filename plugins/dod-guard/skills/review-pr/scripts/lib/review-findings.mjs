import { anchor, firstAnchor, requireAnchored } from "./anchor-findings.mjs";
import { droppedBlock } from "./dropped-block.mjs";
import { groupBy } from "./group-by.mjs";
import { mergedFindings } from "./merge-groups.mjs";
import { requireMergeOutput } from "./merge-output.mjs";
import { regenerate } from "./regenerated-inputs.mjs";
import { slotsBlock } from "./review-slots.mjs";
import { splitRulings } from "./scanner-rulings.mjs";
import { fitScanner, fullListComments, SHOWN, scannerBody } from "./scanner-summary.mjs";

const MARKER = /<!-- dod-guard:review-pr head=([0-9a-f]{7,40}) recommendation=(APPROVE|REQUEST_CHANGES|BLOCK) -->/;
const SEVERITY_PREFIX = /^\*\*(BLOCKER|MAJOR|MINOR)\*\*/;

function marker(headSha, recommendation) {
  return `<!-- dod-guard:review-pr head=${headSha} recommendation=${recommendation} -->`;
}

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

function minorText(finding) {
  const location = `\`${finding.file}:${finding.line}\``;
  return { scanner: finding.scanner, text: ["", location, finding.body].join("\n") };
}

function omissionNote(omitted) {
  const files = omitted === 1 ? "file has" : "files have";
  return `\n${omitted} more ${files} scanner findings, listed only in the scanner findings comments.`;
}

// The minor notes carry scanner text under one budget, so the body stays
// postable however many files the scanner flags.
function fitSections(minor) {
  const entries = minor.map(minorText);
  const fitted = fitScanner(entries);
  const placed = new Set(fitted.texts);
  return { minor: entries.map(({ text }) => text).filter((text) => placed.has(text)), omitted: fitted.omitted };
}

function reviewBody({ headSha, recommendation, counts, block, sections, listed, hasMinor }) {
  const lines = [
    marker(headSha, recommendation),
    "## dod-guard review",
    "",
    `Recommendation: **${recommendation}**`,
    `Findings: ${counts.BLOCKER} BLOCKER, ${counts.MAJOR} MAJOR, ${counts.MINOR} MINOR.`,
    "",
    block,
  ];
  if (listed) {
    lines.push("", "Scanner findings are summarized per file here. The full list is posted as pull request comments");
    lines.push("headed `dod-guard scanner findings`, right after this review.");
  }
  if (hasMinor) {
    lines.push("", "### Minor notes", "", "These do not block the merge and need no reply.", ...sections.minor);
  }
  if (sections.omitted > 0) {
    lines.push(omissionNote(sections.omitted));
  }
  return lines.join("\n");
}

// ASSUMPTION: GitHub rejects a pull request review body over 65536 characters.
// The review is posted once, so the build refuses before that single attempt.
const MAX_REVIEW_BODY = 65_536;

function requirePostableBody(body, slotCount) {
  if (body.length > MAX_REVIEW_BODY) {
    throw new Error(
      `The review body is ${body.length} characters, over the ` +
        `${MAX_REVIEW_BODY}-character limit, with ${slotCount} slots. ` +
        "Nothing was posted; shorten question text in the plan and rebuild.",
    );
  }
  return body;
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
//
// A scanner group describes its own file, so it never takes the cross-file
// fallback: a file the PR only trims anchors on one of its removed lines.
// Only a judged finding can cite a file outside the diff by design.
//
// A blocking finding that still has no line refuses the build.
function anchoredFindings({ changedLines, removedLines, judged, kept }, merge) {
  const lines = { added: changedLines, removed: removedLines };
  const fallback = firstAnchor(lines);
  const groups = [...groupBy(kept, "file")].map(([file, group]) => scannerFinding(file, group));
  const moved = mergedFindings(merge.groups, judged).map((finding) => anchor(finding, lines, fallback));
  return requireAnchored([...moved, ...groups.map((group) => anchor(group, lines, null))]);
}

function planBlocks(plan, { slots, dropped }) {
  return [slotsBlock(plan, slots), droppedBlock(dropped)].filter(Boolean).join("\n\n");
}

function inlineComments(blocking) {
  return blocking.map(({ anchored, body }) => ({ ...anchored, body }));
}

function buildReview(input) {
  const checked = checkedInputs(input);
  const findings = anchoredFindings(checked, input.merge);
  const recommendation = recommendationFor(findings.map((finding) => finding.severity));
  const counts = countSeverities(findings);
  // Only blocking findings become inline threads, so only they get a GH-<id>
  // that a caller can pass to /fix-pr-review.
  const blocking = findings.filter((finding) => finding.severity !== "MINOR");
  const minor = findings.filter((finding) => finding.severity === "MINOR");
  const sections = fitSections(minor);
  const listed = sections.omitted > 0 || findings.some((finding) => finding.truncated);
  const body = reviewBody({
    headSha: input.headSha,
    recommendation,
    counts,
    block: planBlocks(input.plan, checked),
    sections,
    listed,
    hasMinor: minor.length > 0,
  });
  const payload = {
    commit_id: input.headSha,
    event: "COMMENT",
    body: requirePostableBody(body, checked.slots.length),
    comments: inlineComments(blocking),
  };
  const scannerComments = listed ? fullListComments(input.headSha, groupBy(checked.kept, "file")) : [];
  return { recommendation, counts, payload, scannerComments };
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
