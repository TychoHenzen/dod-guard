import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_RECORDS = [
  "requirements",
  "clarifications",
  "implementation-plan",
  "task-list",
];

export const REQUIRED_CHILD_CATEGORIES = [
  "implementation",
  "wiring",
  "refactoring",
  "fixing",
];

export const PROOF_SCENARIOS = ["passing", "incomplete", "ordinary"];

const PROOF_HANDOFF = {
  url: "https://github.com/owner/repo/issues/1#issuecomment-1",
  headSha: "abc1234",
};

export function evaluateConvergence({
  path: deliveryPath = "structured",
  records = {},
  tasks = [],
  children = [],
  acceptance = [],
  contradictions = [],
}) {
  if (deliveryPath === "ordinary") {
    return { outcome: "ordinary", remainder: [] };
  }

  const sections = {
    "Requirements and clarifications": [],
    "Plan and tasks": [],
    "Mandatory child categories": [],
    "Acceptance and verification": [],
  };
  const remainder = [];
  const addRemainder = (section, message) => {
    sections[section].push(message);
    remainder.push(message);
  };

  for (const record of REQUIRED_RECORDS) {
    if (!records[record]) {
      addRemainder(
        record === "implementation-plan" || record === "task-list"
          ? "Plan and tasks"
          : "Requirements and clarifications",
        `missing ${record} record`,
      );
    }
  }
  for (const task of tasks) {
    if (!task.evidence) addRemainder("Plan and tasks", `${task.id} needs implementation evidence`);
  }
  for (const category of REQUIRED_CHILD_CATEGORIES) {
    const matches = children.filter((child) => child.category === category);
    if (matches.length !== 1) {
      addRemainder("Mandatory child categories", `${category} child must be linked exactly once`);
    } else if (!matches[0].evidence) {
      addRemainder("Mandatory child categories", `${category} child needs evidence`);
    }
  }
  for (const criterion of acceptance) {
    if (!criterion.evidence) {
      addRemainder("Acceptance and verification", `${criterion.id} needs fresh evidence`);
    }
  }
  for (const contradiction of contradictions) {
    addRemainder("Acceptance and verification", contradiction);
  }

  const missingTask = tasks.find((task) => !task.evidence);
  const nextAction = missingTask
    ? { task: missingTask.id, owner: missingTask.child ?? "implementation" }
    : remainder.length > 0
      ? { task: remainder[0], owner: "delivery owner" }
      : null;

  return {
    outcome: remainder.length === 0 ? "verified" : "actionable remainder",
    remainder,
    sections,
    nextAction,
  };
}

// The handoff comment already maps every task and criterion; the PR only points at it.
function renderVerifiedConvergence({ url, headSha } = {}) {
  if (!url || !headSha) throw new Error("A verified convergence needs the handoff URL and head SHA.");
  return ["## Convergence", `- Handoff: ${url} (head ${headSha})`, "- Remainder: none"].join("\n");
}

export function renderConvergence(result, handoff) {
  if (result.outcome === "ordinary") {
    return ["## Convergence", "- Outcome: ordinary", "- Remainder: none"].join("\n");
  }
  if (result.outcome === "verified") return renderVerifiedConvergence(handoff);

  const sections = result.sections ?? {};
  const sectionStatus = (name) => {
    const issues = sections[name];
    if (!issues) return "actionable (section evidence unavailable)";
    return issues.length === 0 ? "verified" : `actionable (${issues.join("; ")})`;
  };
  const remainder = result.remainder.length === 0 ? "none" : result.remainder.join("; ");
  const nextAction = result.nextAction
    ? `${result.nextAction.task}; owner: ${result.nextAction.owner}`
    : "none";
  return [
    "## Convergence",
    `- Outcome: ${result.outcome}`,
    `- Requirements and clarifications: ${sectionStatus("Requirements and clarifications")}`,
    `- Plan and tasks: ${sectionStatus("Plan and tasks")}`,
    `- Mandatory child categories: ${sectionStatus("Mandatory child categories")}`,
    `- Acceptance and verification: ${sectionStatus("Acceptance and verification")}`,
    `- Next task: ${nextAction}`,
    `- Remainder: ${remainder}`,
  ].join("\n");
}

export function scenarioResult(scenario = "passing") {
  if (scenario === "ordinary") return evaluateConvergence({ path: "ordinary" });
  if (scenario === "incomplete") {
    return evaluateConvergence({
      records: { requirements: true, clarifications: true, "implementation-plan": true },
      tasks: [{ id: "task-2", child: "wiring", evidence: "" }],
      children: [{ category: "implementation", evidence: "mapped" }],
      acceptance: [{ id: "AC-2", evidence: "" }],
      contradictions: ["user path not exercised"],
    });
  }
  if (scenario === "passing") {
    return evaluateConvergence({
      records: Object.fromEntries(REQUIRED_RECORDS.map((record) => [record, true])),
      tasks: [{ id: "task-1", child: "implementation", evidence: "commit abc123" }],
      children: REQUIRED_CHILD_CATEGORIES.map((category) => ({ category, evidence: "mapped" })),
      acceptance: [{ id: "AC-1", evidence: "proof" }],
    });
  }
  throw new Error(`Unknown proof scenario "${scenario}". Expected: ${PROOF_SCENARIOS.join(", ")}`);
}

export function runProof(scenario = "passing") {
  const result = scenarioResult(scenario);
  process.stdout.write(`${renderConvergence(result, PROOF_HANDOFF)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runProof(process.argv[2] ?? "passing");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
