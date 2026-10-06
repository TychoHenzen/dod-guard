import { parseChangedLines } from "./unified-diff.mjs";

const SEVERITY_RANK = Object.freeze({ BLOCKER: 3, MAJOR: 2, MINOR: 1 });
const JUDGMENT_FIELDS = Object.freeze(["severity", "file", "problem", "impact", "correction", "rootCause", "evidence"]);
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

function firstChangedLine(changedLines, file) {
  const lines = [...(changedLines.get(file) ?? [])];
  if (lines.length === 0) {
    return null;
  }
  return Math.min(...lines);
}

// Cross-file rules only hold on a whole-repository scan, so the scan covers everything and this keeps changed files.
function scannerGroups(scan, changedFiles) {
  const wanted = new Set(changedFiles.map(slashPath));
  const groups = new Map();
  for (const violation of scan.violations ?? []) {
    const file = slashPath(violation.file);
    if (wanted.has(file)) {
      groups.set(file, [...(groups.get(file) ?? []), violation]);
    }
  }
  return groups;
}

function scannerFinding(file, violations, changedLines) {
  const sorted = [...violations].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
  const severity = sorted.some((violation) => violation.severity === "error") ? "MAJOR" : "MINOR";
  const items = sorted.map((violation) => `- \`${violation.rule}\` line ${violation.line}: ${violation.message}`);
  return {
    severity,
    file,
    line: firstChangedLine(changedLines, file),
    body: [`**${severity}** quality-guard structural findings (${sorted.length})`, "", ...items].join("\n"),
  };
}

function requireJudgment(finding, reviewer) {
  const missing = JUDGMENT_FIELDS.filter((field) => typeof finding?.[field] !== "string" || finding[field].trim() === "");
  if (missing.length > 0 || !SEVERITY_RANK[finding.severity]) {
    throw new Error(`${reviewer} returned a finding without ${missing.join(", ") || "a valid severity"}`);
  }
}

function rootCauseKey(finding) {
  return finding.rootCause.toLowerCase().replace(NON_ALPHANUMERIC, " ").trim();
}

function dedupeJudgments(results) {
  const byRootCause = new Map();
  for (const result of results) {
    for (const finding of result.findings ?? []) {
      requireJudgment(finding, result.reviewer);
      const key = rootCauseKey(finding);
      const kept = byRootCause.get(key);
      if (!kept || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[kept.severity]) {
        byRootCause.set(key, { ...finding, file: slashPath(finding.file), reviewer: result.reviewer });
      }
    }
  }
  return [...byRootCause.values()];
}

function judgmentBody(finding) {
  return [
    `**${finding.severity}** ${finding.problem}`,
    "",
    `Impact: ${finding.impact}`,
    `Correction: ${finding.correction}`,
    `Evidence: ${finding.evidence}`,
    `Requirement: ${finding.requirement ?? "repository rule"} (${finding.reviewer})`,
  ].join("\n");
}

// GitHub only accepts an inline comment on a line the diff adds, so anything else goes in the review body.
function anchoredLine(finding, changedLines) {
  const line = Number(finding.line);
  if (changedLines.get(finding.file)?.has(line)) {
    return line;
  }
  return null;
}

function reviewBody(headSha, recommendation, unanchored, counts) {
  const lines = [marker(headSha, recommendation), "## dod-guard review", "", `Recommendation: **${recommendation}**`];
  lines.push(`Findings: ${counts.BLOCKER} BLOCKER, ${counts.MAJOR} MAJOR, ${counts.MINOR} MINOR.`);
  for (const finding of unanchored) {
    lines.push("", `### \`${finding.file}\``, finding.body);
  }
  return lines.join("\n");
}

function countSeverities(findings) {
  const counts = { BLOCKER: 0, MAJOR: 0, MINOR: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function buildReview({ headSha, scan, changedFiles, diff, results }) {
  const changedLines = parseChangedLines(diff);
  const scanner = [...scannerGroups(scan, changedFiles)].map(([file, group]) => scannerFinding(file, group, changedLines));
  const judgments = dedupeJudgments(results).map((finding) => ({
    severity: finding.severity,
    file: finding.file,
    line: anchoredLine(finding, changedLines),
    body: judgmentBody(finding),
  }));
  const findings = [...judgments, ...scanner];
  const recommendation = recommendationFor(findings.map((finding) => finding.severity));
  const counts = countSeverities(findings);
  const anchored = findings.filter((finding) => finding.line !== null);
  const unanchored = findings.filter((finding) => finding.line === null);
  return {
    recommendation,
    counts,
    payload: {
      commit_id: headSha,
      event: "COMMENT",
      body: reviewBody(headSha, recommendation, unanchored, counts),
      comments: anchored.map(({ file, line, body }) => ({ path: file, line, side: "RIGHT", body })),
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
