function slashPath(path) {
  return String(path).replaceAll("\\", "/");
}

const SEVERITY_RANK = Object.freeze({ BLOCKER: 3, MAJOR: 2, MINOR: 1 });
const REVIEWERS = Object.freeze([
  "review-pr-feature",
  "review-pr-design",
  "review-pr-reliability",
  "review-pr-hygiene",
]);
const RULING_STATUSES = Object.freeze(["VERIFIED", "FINDING"]);
const JUDGMENT_FIELDS = Object.freeze([
  "severity",
  "file",
  "problem",
  "impact",
  "requirement",
  "correction",
  "rootCause",
  "evidence",
]);
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

function requireJudgment(finding, reviewer) {
  const missing = JUDGMENT_FIELDS.filter(
    (field) =>
      typeof finding?.[field] !== "string" || finding[field].trim() === "",
  );
  if (!(Number.isInteger(finding?.line) && finding.line > 0)) {
    missing.push("line");
  }
  if (missing.length > 0 || !SEVERITY_RANK[finding.severity]) {
    throw new Error(
      `${reviewer} returned a finding without ${missing.join(", ") || "a valid severity"}`,
    );
  }
}

function rulingProblem(name, ruling, assigned, seen) {
  const slot = ruling?.slot;
  if (!assigned.has(slot)) {
    return `${name}: ruling for slot ${JSON.stringify(slot ?? null)} is not assigned to this lens`;
  }
  if (seen.has(slot)) {
    return `${name}: duplicate ruling for slot ${slot}`;
  }
  if (!RULING_STATUSES.includes(ruling.status)) {
    return `${name}: unknown status ${JSON.stringify(ruling.status ?? null)} for slot ${slot}`;
  }
  if (typeof ruling.evidence !== "string" || ruling.evidence.trim() === "") {
    return `${name}: ruling for slot ${slot} needs evidence`;
  }
  return null;
}

// A judge rules once on every slot assigned to its lens and on no other slot.
function rulingProblems(name, rulings, assigned) {
  const seen = new Set();
  const problems = [];
  for (const ruling of rulings) {
    const problem = rulingProblem(name, ruling, assigned, seen);
    if (problem) {
      problems.push(problem);
    }
    seen.add(ruling?.slot);
  }
  for (const slot of assigned) {
    if (!seen.has(slot)) {
      problems.push(`${name}: missing ruling for slot ${slot}`);
    }
  }
  return problems;
}

// One review per PR is permanent, so a review missing an angle must fail here
// rather than read as clean.
function requireResults(results, assigned) {
  if (!Array.isArray(results)) {
    throw new Error("The reviewer results must be a JSON array");
  }
  const problems = REVIEWERS.flatMap((name) => {
    const matches = results.filter((result) => result?.reviewer === name);
    if (matches.length !== 1) {
      return [`${name}: expected one result, got ${matches.length}`];
    }
    const [result] = matches;
    if (!(Array.isArray(result.findings) && Array.isArray(result.rulings))) {
      return [`${name}: needs a findings array and a rulings array`];
    }
    return rulingProblems(name, result.rulings, assigned.get(name) ?? new Set());
  });
  if (problems.length > 0) {
    throw new Error(
      `Incomplete reviewer results; do not post: ${problems.join("; ")}`,
    );
  }
}

// Same cause in two files is two places to fix, so the file is part of the
// identity.
function judgmentKey(finding) {
  return `${slashPath(finding.file)}\n${finding.rootCause.toLowerCase().replace(NON_ALPHANUMERIC, " ").trim()}`;
}

function keepHighest(byKey, finding, reviewer) {
  requireJudgment(finding, reviewer);
  const key = judgmentKey(finding);
  const kept = byKey.get(key);
  if (!kept || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[kept.severity]) {
    byKey.set(key, { ...finding, file: slashPath(finding.file), reviewer });
  }
}

function dedupeJudgments(results, assigned) {
  requireResults(results, assigned);
  const byKey = new Map();
  for (const result of results) {
    for (const finding of result.findings) {
      keepHighest(byKey, finding, result.reviewer);
    }
  }
  return [...byKey.values()];
}

function judgmentFinding(finding) {
  return {
    severity: finding.severity,
    file: finding.file,
    line: finding.line,
    body: [
      `**${finding.severity}** ${finding.problem}`,
      "",
      `Impact: ${finding.impact}`,
      `Correction: ${finding.correction}`,
      `Evidence: ${finding.evidence}`,
      `Requirement: ${finding.requirement} (${finding.reviewer})`,
    ].join("\n"),
  };
}

// Validates all four reviewer envelopes and their rulings against the slots
// assigned to each lens, then returns one finding per file and root cause, ready
// to anchor.
function judgmentFindings(results, assigned) {
  return dedupeJudgments(results, assigned).map(judgmentFinding);
}

export { judgmentFindings, REVIEWERS };
