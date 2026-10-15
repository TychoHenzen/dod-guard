import { droppedBlock } from "./dropped-block.mjs";
import { judgedCandidates, scannerCandidates } from "./finding-ids.mjs";
import { mergedFindings } from "./merge-groups.mjs";
import { requireMergeOutput } from "./merge-output.mjs";
import { requirePlan, reviewSlots, slotsBlock, slotsByLens } from "./review-slots.mjs";
import { splitRulings } from "./scanner-rulings.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

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

function scannerGroups(scanner) {
  const groups = new Map();
  for (const violation of scanner) {
    groups.set(violation.file, [...(groups.get(violation.file) ?? []), violation]);
  }
  return groups;
}

function scannerFinding(file, violations) {
  const sorted = [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
  const severity = sorted.some((violation) => violation.severity === "high") ? "MAJOR" : "MINOR";
  const items = sorted.map((violation) => `- \`${violation.rule}\` line ${violation.line}: ${violation.message}`);
  return {
    severity,
    file,
    line: sorted[0].line,
    body: [`**${severity}** quality-guard structural findings (${sorted.length})`, "", ...items].join("\n"),
  };
}

function nearestLine(lines, wanted) {
  return [...lines].reduce((best, line) => (Math.abs(line - wanted) < Math.abs(best - wanted) ? line : best));
}

function firstAnchor(changedLines) {
  for (const [file, lines] of changedLines) {
    if (lines.size > 0) {
      return { file, line: Math.min(...lines) };
    }
  }
  return null;
}

// GitHub only accepts an inline comment on a line the diff adds. Moving a
// finding to the nearest such line keeps
// it a review comment with its own GH-<id>, which /fix-pr-review needs to
// select it.
function anchor(finding, changedLines, fallback) {
  const lines = changedLines.get(finding.file);
  if (lines?.has(finding.line)) {
    return { ...finding, anchored: { path: finding.file, line: finding.line } };
  }
  const cited = `\n\nCited location: \`${finding.file}:${finding.line}\`, which this PR does not change.`;
  if (lines?.size > 0) {
    return {
      ...finding,
      anchored: { path: finding.file, line: nearestLine(lines, finding.line) },
      body: finding.body + cited,
    };
  }
  if (fallback) {
    return {
      ...finding,
      anchored: { path: fallback.file, line: fallback.line },
      body: finding.body + cited,
    };
  }
  return { ...finding, anchored: null };
}

function countSeverities(findings) {
  const counts = { BLOCKER: 0, MAJOR: 0, MINOR: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function reviewBody({ headSha, recommendation, counts, block, unanchored, minor }) {
  const lines = [
    marker(headSha, recommendation),
    "## dod-guard review",
    "",
    `Recommendation: **${recommendation}**`,
    `Findings: ${counts.BLOCKER} BLOCKER, ${counts.MAJOR} MAJOR, ${counts.MINOR} MINOR.`,
    "",
    block,
  ];
  for (const finding of unanchored) {
    const heading = `### \`${finding.file}:${finding.line}\` (no added line to anchor on)`;
    lines.push("", heading, finding.body);
  }
  if (minor.length > 0) {
    lines.push("", "### Minor notes", "", "These do not block the merge and need no reply.");
    for (const finding of minor) {
      lines.push("", `\`${finding.file}:${finding.line}\``, finding.body);
    }
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
function checkedInputs({ scan, diff, results, plan, pbi, subIssues, merge }) {
  const changedLines = parseChangedLines(diff);
  const slots = reviewSlots({ changedLines, pbi, subIssues });
  requirePlan(plan, slots);
  const judged = judgedCandidates(results, slotsByLens(plan));
  const scanner = scannerCandidates(scan, changedLines);
  requireMergeOutput(merge, { judged, scanner, plan });
  return { changedLines, slots, judged, ...splitRulings(merge.scanner, scanner) };
}

// Only kept violations reach the unchanged scannerFinding, so a dropped one
// never sets a file's severity or shows in the counts.
function anchoredFindings({ changedLines, judged, kept }, merge) {
  const fallback = firstAnchor(changedLines);
  const groups = [...scannerGroups(kept)].map(([file, group]) => scannerFinding(file, group));
  const findings = [...mergedFindings(merge.groups, judged), ...groups];
  return findings.map((finding) => anchor(finding, changedLines, fallback));
}

function planBlocks(plan, { slots, dropped }) {
  return [slotsBlock(plan, slots), droppedBlock(dropped)].filter(Boolean).join("\n\n");
}

function inlineComments(blocking) {
  const comment = ({ anchored, body }) => ({ ...anchored, side: "RIGHT", body });
  return blocking.filter((finding) => finding.anchored).map(comment);
}

function buildReview(input) {
  const checked = checkedInputs(input);
  const findings = anchoredFindings(checked, input.merge);
  const recommendation = recommendationFor(findings.map((finding) => finding.severity));
  const counts = countSeverities(findings);
  // Only blocking findings become inline threads, so only they get a GH-<id>
  // that a caller can pass to /fix-pr-review.
  const blocking = findings.filter((finding) => finding.severity !== "MINOR");
  const body = reviewBody({
    headSha: input.headSha,
    recommendation,
    counts,
    block: planBlocks(input.plan, checked),
    unanchored: blocking.filter((finding) => !finding.anchored),
    minor: findings.filter((finding) => finding.severity === "MINOR"),
  });
  const payload = {
    commit_id: input.headSha,
    event: "COMMENT",
    body: requirePostableBody(body, checked.slots.length),
    comments: inlineComments(blocking),
  };
  return { recommendation, counts, payload };
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
      url: comment.html_url,
    }));
}

export { buildReview, existingReview, postedFindings };
