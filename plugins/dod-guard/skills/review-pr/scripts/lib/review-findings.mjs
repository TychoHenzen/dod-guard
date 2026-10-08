import { judgmentFindings } from "./reviewer-results.mjs";
import { questionsBlock } from "./review-questions.mjs";
import { ruleScope } from "./rule-scope.mjs";
import { parseChangedLines } from "./unified-diff.mjs";

const MARKER =
  /<!-- dod-guard:review-pr head=([0-9a-f]{7,40}) recommendation=(APPROVE|REQUEST_CHANGES|BLOCK) -->/;
const SEVERITY_PREFIX = /^\*\*(BLOCKER|MAJOR|MINOR)\*\*/;

function slashPath(path) {
  return String(path).replaceAll("\\", "/");
}

function marker(headSha, recommendation) {
  return `<!-- dod-guard:review-pr head=${headSha} recommendation=${recommendation} -->`;
}

function recommendationFor(severities) {
  if (severities.includes("BLOCKER")) {
    return "BLOCK";
  }
  if (severities.length > 0) {
    return "REQUEST_CHANGES";
  }
  return "APPROVE";
}

function inScope(violation, changedLines) {
  const lines = changedLines.get(slashPath(violation.file));
  if (!lines) {
    return false;
  }
  return ruleScope(violation.rule) === "file" || lines.has(violation.line);
}

const SCANNER_SEVERITIES = new Set(["high", "medium", "low"]);

function requireScannerSeverity(violation) {
  if (!SCANNER_SEVERITIES.has(violation.severity)) {
    throw new Error(
      `quality-guard reported unknown severity "${violation.severity}" for ${violation.file}:${violation.line} ` +
        `(${violation.rule}); update the installed quality-guard plugin`,
    );
  }
}

// Cross-file rules only hold on a whole-repository scan, so the scan covers
// everything and this keeps the PR's share.
function scannerGroups(scan, changedLines) {
  const groups = new Map();
  for (const violation of scan.violations ?? []) {
    requireScannerSeverity(violation);
    if (inScope(violation, changedLines)) {
      const file = slashPath(violation.file);
      groups.set(file, [...(groups.get(file) ?? []), violation]);
    }
  }
  return groups;
}

function scannerFinding(file, violations) {
  const sorted = [...violations].sort(
    (left, right) =>
      left.line - right.line || left.rule.localeCompare(right.rule),
  );
  const severity = sorted.some((violation) => violation.severity === "high")
    ? "MAJOR"
    : "MINOR";
  const items = sorted.map(
    (violation) =>
      `- \`${violation.rule}\` line ${violation.line}: ${violation.message}`,
  );
  return {
    severity,
    file,
    line: sorted[0].line,
    body: [
      `**${severity}** quality-guard structural findings (${sorted.length})`,
      "",
      ...items,
    ].join("\n"),
  };
}

function nearestLine(lines, wanted) {
  return [...lines].reduce((best, line) =>
    Math.abs(line - wanted) < Math.abs(best - wanted) ? line : best,
  );
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

function reviewBody({ headSha, recommendation, counts, questions, unanchored }) {
  const lines = [
    marker(headSha, recommendation),
    "## dod-guard review",
    "",
    `Recommendation: **${recommendation}**`,
    `Findings: ${counts.BLOCKER} BLOCKER, ${counts.MAJOR} MAJOR, ${counts.MINOR} MINOR.`,
    "",
    questionsBlock(questions),
  ];
  for (const finding of unanchored) {
    const heading = `### \`${finding.file}:${finding.line}\` (no added line to anchor on)`;
    lines.push("", heading, finding.body);
  }
  return lines.join("\n");
}

function buildReview({ headSha, scan, diff, results, questions }) {
  const changedLines = parseChangedLines(diff);
  // Approving a review that saw no changed file would be false.
  if (changedLines.size === 0) {
    throw new Error("The diff names no changed files");
  }
  const fallback = firstAnchor(changedLines);
  const raw = [
    ...judgmentFindings(results),
    ...[...scannerGroups(scan, changedLines)].map(([file, group]) =>
      scannerFinding(file, group),
    ),
  ];
  const findings = raw.map((finding) =>
    anchor(finding, changedLines, fallback),
  );
  const recommendation = recommendationFor(
    findings.map((finding) => finding.severity),
  );
  const counts = countSeverities(findings);
  const inline = findings.filter((finding) => finding.anchored);
  const unanchored = findings.filter((finding) => !finding.anchored);
  return {
    recommendation,
    counts,
    payload: {
      commit_id: headSha,
      event: "COMMENT",
      body: reviewBody({ headSha, recommendation, counts, questions, unanchored }),
      comments: inline.map(({ anchored, body }) => ({
        path: anchored.path,
        line: anchored.line,
        side: "RIGHT",
        body,
      })),
    },
  };
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
    .filter(
      (comment) =>
        comment.pull_request_review_id === reviewId && !comment.in_reply_to_id,
    )
    .map((comment) => ({
      id: `GH-${comment.id}`,
      severity: comment.body.match(SEVERITY_PREFIX)?.[1] ?? "MINOR",
      file: comment.path,
      line: comment.line ?? comment.original_line,
      url: comment.html_url,
    }));
}

export { buildReview, existingReview, postedFindings };
