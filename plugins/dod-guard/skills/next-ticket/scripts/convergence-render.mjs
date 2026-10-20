// The handoff comment already maps every task and criterion; the PR only points at it.
function renderVerifiedConvergence({ url, headSha } = {}) {
  if (!(url && headSha)) {
    throw new Error("A verified convergence needs the handoff URL and head SHA.");
  }
  return ["## Convergence", `- Handoff: ${url} (head ${headSha})`, "- Remainder: none"].join("\n");
}

function sectionStatus(sections, name) {
  const issues = sections[name];
  if (!issues) {
    return "actionable (section evidence unavailable)";
  }
  if (issues.length === 0) {
    return "verified";
  }
  return `actionable (${issues.join("; ")})`;
}

function remainderText(remainder) {
  if (remainder.length === 0) {
    return "none";
  }
  return remainder.join("; ");
}

function nextActionText(nextAction) {
  if (!nextAction) {
    return "none";
  }
  return `${nextAction.task}; owner: ${nextAction.owner}`;
}

// The remainder lines in the order the handoff comment reads them.
function orderedLines(result) {
  const sections = result.sections ?? {};
  const remainder = remainderText(result.remainder);
  const nextAction = nextActionText(result.nextAction);
  return [
    "## Convergence",
    `- Outcome: ${result.outcome}`,
    `- Requirements and clarifications: ${sectionStatus(sections, "Requirements and clarifications")}`,
    `- Plan and tasks: ${sectionStatus(sections, "Plan and tasks")}`,
    `- Functional decomposition: ${sectionStatus(sections, "Functional decomposition")}`,
    `- Acceptance and verification: ${sectionStatus(sections, "Acceptance and verification")}`,
    `- Next task: ${nextAction}`,
    `- Remainder: ${remainder}`,
  ].join("\n");
}

export function renderConvergence(result, handoff) {
  if (result.outcome === "ordinary") {
    return ["## Convergence", "- Outcome: ordinary", "- Remainder: none"].join("\n");
  }
  if (result.outcome === "verified") {
    return renderVerifiedConvergence(handoff);
  }
  return orderedLines(result);
}
