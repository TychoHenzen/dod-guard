import { parseChangedLines } from "./unified-diff.mjs";

const SEVERITY_RANK = Object.freeze({ BLOCKER: 3, MAJOR: 2, MINOR: 1 });
const JUDGMENT_FIELDS = Object.freeze(["severity", "file", "problem", "impact", "correction", "rootCause", "evidence"]);
// Line-level rules judge only the lines this PR wrote; every other rule covers the whole touched file.
const LINE_RULES = new Set([
  "line-length",
  "comment-bloat",
  "commented-out-code",
  "comment-restates-code",
  "comment-metadata",
  "comment-placeholder",
  "comment-missing-reference",
  "todo-marker",
  "naming-encoding",
]);
const MARKER = /<!-- dod-guard:review-pr head=([0-9a-f]{7,40}) recommendation=(APPROVE|REQUEST_CHANGES|BLOCK) -->/;
const SEVERITY_PREFIX = /^\*\*(BLOCKER|MAJOR|MINOR)\*\*/;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

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
  return !LINE_RULES.has(violation.rule) || lines.has(violation.line);
}

// Cross-file rules only hold on a whole-repository scan, so the scan covers everything and this keeps the PR's share.
function scannerGroups(scan, changedLines) {
  const groups = new Map();
  for (const violation of scan.violations ?? []) {
    if (inScope(violation, changedLines)) {
      const file = slashPath(violation.file);
      groups.set(file, [...(groups.get(file) ?? []), violation]);
    }
  }
  return groups;
}

function scannerFinding(file, violations) {
  const sorted = [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
  const severity = sorted.some((violation) => violation.severity === "error") ? "MAJOR" : "MINOR";
  const items = sorted.map((violation) => `- \`${violation.rule}\` line ${violation.line}: ${violation.message}`);
  return {
    severity,
    file,
    line: sorted[0].line,
    body: [`**${severity}** quality-guard structural findings (${sorted.length})`, "", ...items].join("\n"),
  };
}

function requireJudgment(finding, reviewer) {
  const missing = JUDGMENT_FIELDS.filter((field) => typeof finding?.[field] !== "string" || finding[field].trim() === "");
  if (missing.length > 0 || !SEVERITY_RANK[finding.severity]) {
    throw new Error(`${reviewer} returned a finding without ${missing.join(", ") || "a valid severity"}`);
  }
}

// Same cause in two files is two places to fix, so the file is part of the identity.
function judgmentKey(finding) {
  return `${slashPath(finding.file)}\n${finding.rootCause.toLowerCase().replace(NON_ALPHANUMERIC, " ").trim()}`;
}

function dedupeJudgments(results) {
  const byKey = new Map();
  for (const result of results) {
    for (const finding of result.findings ?? []) {
      requireJudgment(finding, result.reviewer);
      const key = judgmentKey(finding);
      const kept = byKey.get(key);
      if (!kept || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[kept.severity]) {
        byKey.set(key, { ...finding, file: slashPath(finding.file), reviewer: result.reviewer });
      }
    }
  }
  return [...byKey.values()];
}

function judgmentFinding(finding) {
  return {
    severity: finding.severity,
    file: finding.file,
    line: Number(finding.line),
    body: [
      `**${finding.severity}** ${finding.problem}`,
      "",
      `Impact: ${finding.impact}`,
      `Correction: ${finding.correction}`,
      `Evidence: ${finding.evidence}`,
      `Requirement: ${finding.requirement ?? "repository rule"} (${finding.reviewer})`,
    ].join("\n"),
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

// GitHub only accepts an inline comment on a line the diff adds. Moving a finding to the nearest such line keeps
// it a review comment with its own GH-<id>, which /fix-pr-review needs to select it.
function anchor(finding, changedLines, fallback) {
  const lines = changedLines.get(finding.file);
  if (lines?.has(finding.line)) {
    return { ...finding, anchored: { path: finding.file, line: finding.line } };
  }
  const cited = `\n\nCited location: \`${finding.file}:${finding.line}\`, which this PR does not change.`;
  if (lines?.size > 0) {
    return { ...finding, anchored: { path: finding.file, line: nearestLine(lines, finding.line) }, body: finding.body + cited };
  }
  if (fallback) {
    return { ...finding, anchored: { path: fallback.file, line: fallback.line }, body: finding.body + cited };
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

function reviewBody(headSha, recommendation, counts, unanchored) {
  const lines = [marker(headSha, recommendation), "## dod-guard review", "", `Recommendation: **${recommendation}**`];
  lines.push(`Findings: ${counts.BLOCKER} BLOCKER, ${counts.MAJOR} MAJOR, ${counts.MINOR} MINOR.`);
  for (const finding of unanchored) {
    lines.push("", `### \`${finding.file}:${finding.line}\` (no added line in this PR to anchor on)`, finding.body);
  }
  return lines.join("\n");
}

function buildReview({ headSha, scan, diff, results }) {
  const changedLines = parseChangedLines(diff);
  const fallback = firstAnchor(changedLines);
  const raw = [
    ...dedupeJudgments(results).map(judgmentFinding),
    ...[...scannerGroups(scan, changedLines)].map(([file, group]) => scannerFinding(file, group)),
  ];
  const findings = raw.map((finding) => anchor(finding, changedLines, fallback));
  const recommendation = recommendationFor(findings.map((finding) => finding.severity));
  const counts = countSeverities(findings);
  const inline = findings.filter((finding) => finding.anchored);
  return {
    recommendation,
    counts,
    payload: {
      commit_id: headSha,
      event: "COMMENT",
      body: reviewBody(headSha, recommendation, counts, findings.filter((finding) => !finding.anchored)),
      comments: inline.map(({ anchored, body }) => ({ path: anchored.path, line: anchored.line, side: "RIGHT", body })),
    },
  };
}

function existingReview(reviews) {
  for (const review of reviews) {
    const match = review.body?.match(MARKER);
    if (match) {
      return { found: true, reviewId: review.id, headSha: match[1], recommendation: match[2], url: review.html_url };
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
