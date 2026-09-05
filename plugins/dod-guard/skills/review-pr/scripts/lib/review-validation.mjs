const REVIEWERS = Object.freeze([
  "review-pr-feature",
  "review-pr-design",
  "review-pr-reliability",
  "review-pr-hygiene",
]);
const FINDING_FIELDS = Object.freeze([
  "correction",
  "evidence",
  "file",
  "impact",
  "line",
  "problem",
  "requirement",
  "rootCause",
  "severity",
]);
const PULL_REQUEST_FINDING_FIELDS = Object.freeze([...FINDING_FIELDS, "location"]);
const TEXT_FINDING_FIELDS = FINDING_FIELDS.filter((name) => !["line", "severity"].includes(name));
const SEVERITIES = new Set(["BLOCKER", "MAJOR", "MINOR"]);

function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateReviewContext(context) {
  for (const field of ["provider", "repository", "baseRef", "targetRef", "headSha", "diffFile", "finalFileAccess"]) {
    requireValue(typeof context[field] === "string" && context[field].length > 0, `Review context is missing ${field}.`);
  }
  requireValue(Array.isArray(context.changedFiles), "Review context is missing changedFiles.");
  requireValue(Array.isArray(context.repositoryInstructions), "Review context is missing repositoryInstructions.");
  requireValue(context.workItem && typeof context.workItem === "object", "Review context is missing workItem.");
  requireValue(
    typeof context.workItem.acceptanceCriteria === "string" && context.workItem.acceptanceCriteria.length > 0,
    "Review context is missing normalized acceptance criteria.",
  );
  requireValue(
    Array.isArray(context.reviewRequirements) && context.reviewRequirements.length > 0,
    "Review context is missing reviewRequirements.",
  );
  requireValue(
    context.reviewRequirements.every((requirement) => typeof requirement === "string" && requirement.length > 0),
    "Review context contains an invalid review requirement.",
  );
  return context;
}

function validateFindingShape(finding) {
  requireValue(finding && typeof finding === "object" && !Array.isArray(finding), "Reviewer returned a non-object finding.");
  const pullRequestLevel = finding.location === "pull-request";
  let expectedFields = FINDING_FIELDS;
  let validLocation = typeof finding.file === "string" && Number.isInteger(finding.line);
  if (pullRequestLevel) {
    expectedFields = PULL_REQUEST_FINDING_FIELDS;
    validLocation = finding.file === null && finding.line === null;
  }
  requireValue(
    Object.keys(finding).sort().join("\n") === [...expectedFields].sort().join("\n"),
    "Reviewer finding fields do not match the required schema.",
  );
  requireValue(SEVERITIES.has(finding.severity), `Reviewer returned invalid severity ${finding.severity ?? ""}.`);
  requireValue(validLocation, "Reviewer finding lacks a valid location.");
  for (const field of TEXT_FINDING_FIELDS) {
    if (!(field === "file" && pullRequestLevel)) {
      requireValue(typeof finding[field] === "string" && finding[field].length > 0, `Reviewer finding has invalid ${field}.`);
    }
  }
}

function validateReviewerResult(result, reviewer, reviewRequirements) {
  requireValue(REVIEWERS.includes(reviewer), `Unknown reviewer ${reviewer}.`);
  requireValue(result && typeof result === "object" && !Array.isArray(result), `${reviewer} returned no review envelope.`);
  requireValue(result.reviewer === reviewer, `${reviewer} returned the wrong reviewer identity.`);
  requireValue(Array.isArray(result.coverage) && result.coverage.length > 0, `${reviewer} returned no coverage evidence.`);
  requireValue(Array.isArray(result.findings), `${reviewer} returned no findings array.`);
  for (const item of result.coverage) {
    requireValue(
      item && typeof item.requirement === "string" && ["VERIFIED", "FINDING"].includes(item.status) && typeof item.evidence === "string" && item.evidence.length > 0,
      `${reviewer} returned malformed coverage evidence.`,
    );
  }
  if (reviewer === "review-pr-feature") {
    const covered = new Set(result.coverage.map(({ requirement }) => requirement));
    const missing = reviewRequirements.filter((requirement) => !covered.has(requirement));
    requireValue(missing.length === 0, `Feature review omitted requirements: ${missing.join(" | ")}`);
  }
  result.findings.forEach(validateFindingShape);
  return result;
}

export { validateReviewContext, validateReviewerResult };
