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

function requireJudgment(finding, reviewer) {
  const missing = JUDGMENT_FIELDS.filter(
    (field) => typeof finding?.[field] !== "string" || finding[field].trim() === "",
  );
  if (!(Number.isInteger(finding?.line) && finding.line > 0)) {
    missing.push("line");
  }
  if (missing.length > 0 || !SEVERITY_RANK[finding.severity]) {
    throw new Error(`${reviewer} returned a finding without ${missing.join(", ") || "a valid severity"}`);
  }
}

function rulingProblem(ruling, assigned, seen) {
  const slot = ruling?.slot;
  if (!assigned.has(slot)) {
    return `ruling for slot ${JSON.stringify(slot ?? null)} is not assigned to this lens`;
  }
  if (seen.has(slot)) {
    return `duplicate ruling for slot ${slot}`;
  }
  if (!RULING_STATUSES.includes(ruling.status)) {
    return `unknown status ${JSON.stringify(ruling.status ?? null)} for slot ${slot}`;
  }
  // ASSUMPTION: a ruling without evidence cannot be checked, so it counts as
  // missing, the same as the free-text records it replaces.
  if (typeof ruling.evidence !== "string" || ruling.evidence.trim() === "") {
    return `ruling for slot ${slot} needs evidence`;
  }
  return null;
}

// A judge rules once on every slot assigned to its lens and on no other slot.
function rulingProblems(name, rulings, assigned) {
  const seen = new Set();
  const problems = [];
  for (const ruling of rulings) {
    const problem = rulingProblem(ruling, assigned, seen);
    if (problem) {
      problems.push(`${name}: ${problem}`);
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

// An entry outside the four reviewers, or a null entry, would post findings
// that no reviewer contract validated.
function strayProblems(results) {
  return results.flatMap((result, index) =>
    REVIEWERS.includes(result?.reviewer)
      ? []
      : [`result ${index + 1}: unknown reviewer ` + `${JSON.stringify(result?.reviewer ?? null)}`],
  );
}

// recommendationFor reads only finding severities, so a FINDING ruling with no
// finding would post as APPROVE and hide the gap it flagged.
function unbackedFindingProblems(name, result) {
  if (result.findings.length > 0) {
    return [];
  }
  return result.rulings
    .filter((ruling) => ruling?.status === "FINDING")
    .map((ruling) => `${name}: FINDING ruling for slot ${ruling.slot} has no entry in findings`);
}

function resultProblems(name, results, assigned) {
  const matches = results.filter((result) => result?.reviewer === name);
  if (matches.length !== 1) {
    return [`${name}: expected one result, got ${matches.length}`];
  }
  const [result] = matches;
  if (!(Array.isArray(result.findings) && Array.isArray(result.rulings))) {
    return [`${name}: needs a findings array and a rulings array`];
  }
  return [
    ...rulingProblems(name, result.rulings, assigned.get(name) ?? new Set()),
    ...unbackedFindingProblems(name, result),
  ];
}

// One review per PR is permanent, so a review missing an angle must fail here
// rather than read as clean.
function requireResults(results, assigned) {
  if (!Array.isArray(results)) {
    throw new Error("The reviewer results must be a JSON array");
  }
  const problems = [...strayProblems(results), ...REVIEWERS.flatMap((name) => resultProblems(name, results, assigned))];
  if (problems.length > 0) {
    throw new Error(`Incomplete reviewer results; do not post: ${problems.join("; ")}`);
  }
}

// Every finding reaches the merge pass, which alone may judge that two lenses
// worded one defect differently; no wording key can decide that.
function judgedFindings(results, assigned) {
  requireResults(results, assigned);
  return REVIEWERS.flatMap((reviewer) =>
    results
      .find((result) => result.reviewer === reviewer)
      .findings.map((finding) => {
        requireJudgment(finding, reviewer);
        return { ...finding, file: slashPath(finding.file), reviewer };
      }),
  );
}

export { judgedFindings, REVIEWERS, SEVERITY_RANK };
