import { anchor, firstAnchor, requireAnchored } from "./anchor-findings.mjs";
import { droppedBlock } from "./dropped-block.mjs";
import { MAX_FIX_THREADS, splitFixThreads } from "./fix-threads.mjs";
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

// ASSUMPTION: GitHub rejects a pull request review body over 65536 characters.
// The review is posted once, so the build refuses before that single attempt.
const MAX_REVIEW_BODY = 65_536;

// Room kept for the omission note, which is added after the fit.
const NOTES_RESERVE = 1000;

// One line per deferred finding, its location and its headline, so each entry stays short.
function deferredLine(finding) {
  return `\`${finding.file}:${finding.line}\` ${finding.body.split("\n")[0]}`;
}

// Deferred findings and minor notes share what the rest of the body leaves, so a
// plan with many slots or a move with many flagged files still posts. Judged
// entries always render, so their text is counted first. A scanner group, deferred
// or minor, renders only while there is room: the scanner comments list them all.
function fitSections(fixedBody, { deferred, minor }) {
  const entries = {
    deferred: deferred.map((finding) => ({ scanner: finding.scanner, text: deferredLine(finding) })),
    minor: minor.map(minorText),
  };
  const all = [...entries.deferred, ...entries.minor];
  const judged = all.filter((entry) => !entry.scanner).reduce((sum, entry) => sum + entry.text.length + 1, 0);
  const room = Math.max(0, MAX_REVIEW_BODY - fixedBody.length - judged - NOTES_RESERVE);
  const fitted = fitScanner(all, room);
  const placed = new Set(fitted.placed);
  const texts = (list) => list.filter((entry) => placed.has(entry)).map(({ text }) => text);
  return { deferred: texts(entries.deferred), minor: texts(entries.minor), omitted: fitted.omitted };
}

function reviewBody({ headSha, recommendation, counts, block, sections, listed, hasMinor, hasDeferred }) {
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
  if (hasDeferred) {
    lines.push("", "### Deferred findings", "");
    lines.push(
      `Only the ${MAX_FIX_THREADS} worst findings get a thread to fix in this pull request. These need no reply.`,
    );
    lines.push("", ...sections.deferred);
  }
  if (hasMinor) {
    lines.push("", "### Minor notes", "", "These do not block the merge and need no reply.", ...sections.minor);
  }
  if (sections.omitted > 0) {
    lines.push(omissionNote(sections.omitted));
  }
  return lines.join("\n");
}

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
  const minor = findings.filter((finding) => finding.severity === "MINOR");
  const parts = { headSha: input.headSha, recommendation, counts, block: planBlocks(input.plan, checked) };
  // The body without its deferred and minor entries, with every heading they could add.
  const empty = { deferred: [], minor: [], omitted: 0 };
  const fixed = reviewBody({ ...parts, sections: empty, listed: true, hasMinor: true, hasDeferred: true });
  const sections = fitSections(fixed, { deferred, minor });
  const listed = sections.omitted > 0 || findings.some((finding) => finding.truncated);
  const shown = { hasMinor: minor.length > 0, hasDeferred: deferred.length > 0 };
  const body = reviewBody({ ...parts, sections, listed, ...shown });
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

export { buildReview, existingReview, postedFindings, requirePostableBody };
