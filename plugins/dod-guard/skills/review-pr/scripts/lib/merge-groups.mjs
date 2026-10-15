import { REVIEWERS, SEVERITY_RANK } from "./reviewer-results.mjs";

function memberProblem(id, byId, seen) {
  if (!byId.has(id)) {
    return `unknown J id ${JSON.stringify(id ?? null)}`;
  }
  if (seen.has(id)) {
    return `duplicate J id ${id}`;
  }
  seen.add(id);
  return null;
}

function representativeProblem(group) {
  if (group.members.includes(group.representative)) {
    return null;
  }
  return `representative ${JSON.stringify(group.representative ?? null)} is not a member`;
}

// One posted comment has one file and line, so a group spanning files would
// hide every location but the representative's.
function fileProblem(group, byId) {
  const known = group.members.filter((id) => byId.has(id));
  const files = new Set(known.map((id) => byId.get(id).file));
  if (files.size < 2) {
    return null;
  }
  return `members ${known.join(", ")} are in different files (${[...files].join(", ")})`;
}

function problemsOf(group, byId, seen) {
  if (!(Array.isArray(group?.members) && group.members.length > 0)) {
    return ["it has no members"];
  }
  const problems = [
    ...group.members.map((id) => memberProblem(id, byId, seen)),
    representativeProblem(group),
    fileProblem(group, byId),
  ];
  return problems.filter(Boolean);
}

// Every judged finding is in exactly one group, so a merge pass cannot drop a
// finding by leaving it out or post it twice.
function groupProblems(groups, judged) {
  const byId = new Map(judged.map((finding) => [finding.id, finding]));
  const seen = new Set();
  const labelled = (group, index) => {
    const label = `group ${index + 1}: `;
    return problemsOf(group, byId, seen).map((text) => label + text);
  };
  const problems = groups.flatMap(labelled);
  const missing = judged.filter((finding) => !seen.has(finding.id)).map((finding) => finding.id);
  return [...problems, ...missing.map((id) => `missing J id ${id}: it is in no group`)];
}

function highestSeverity(members) {
  const rank = (severity) => SEVERITY_RANK[severity];
  const severities = members.map((member) => member.severity);
  return severities.reduce((top, severity) => (rank(severity) > rank(top) ? severity : top));
}

function mergedFinding(members, representative) {
  const severity = highestSeverity(members);
  const reviewers = REVIEWERS.filter((name) => members.some((member) => member.reviewer === name));
  return {
    severity,
    file: representative.file,
    line: representative.line,
    body: [
      `**${severity}** ${representative.problem}`,
      "",
      `Impact: ${representative.impact}`,
      `Correction: ${representative.correction}`,
      `Evidence: ${representative.evidence}`,
      `Requirement: ${representative.requirement} (${reviewers.join(", ")})`,
    ].join("\n"),
  };
}

// One finding per group: the representative's text and location, the highest
// member severity, and every lens that found it. Call only after the groups
// pass groupProblems.
function mergedFindings(groups, judged) {
  const position = new Map(judged.map((finding, index) => [finding.id, index]));
  const first = (group) => Math.min(...group.members.map((id) => position.get(id)));
  // ASSUMPTION: findings post in judged order of each group's earliest member,
  // so the order the pass happens to list its groups never reorders a review.
  const ordered = [...groups].sort((left, right) => first(left) - first(right));
  return ordered.map((group) => {
    const members = group.members.map((id) => judged[position.get(id)]);
    return mergedFinding(members, judged[position.get(group.representative)]);
  });
}

export { groupProblems, mergedFindings };
