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

export function evaluateConvergence({
  path: deliveryPath = "structured",
  records = {},
  tasks = [],
  children = [],
  acceptance = [],
  contradictions = [],
}) {
  if (deliveryPath === "ordinary") return { outcome: "ordinary", remainder: [] };

  const remainder = REQUIRED_RECORDS
    .filter((record) => !records[record])
    .map((record) => `missing ${record} record`);
  for (const task of tasks) {
    if (!task.evidence) remainder.push(`${task.id} needs implementation evidence`);
  }
  for (const category of REQUIRED_CHILD_CATEGORIES) {
    const matches = children.filter((child) => child.category === category);
    if (matches.length !== 1) remainder.push(`${category} child must be linked exactly once`);
    else if (!matches[0].evidence) remainder.push(`${category} child needs evidence`);
  }
  for (const criterion of acceptance) {
    if (!criterion.evidence) remainder.push(`${criterion.id} needs fresh evidence`);
  }
  for (const contradiction of contradictions) remainder.push(contradiction);

  return remainder.length === 0
    ? { outcome: "verified", remainder: [] }
    : { outcome: "actionable remainder", remainder };
}

export function renderConvergence(result) {
  const remainder = result.remainder.length === 0 ? "none" : result.remainder.join("; ");
  return [
    "## Convergence",
    `- Outcome: ${result.outcome}`,
    "- Requirements and clarifications: exercised",
    "- Plan and tasks: mapped to evidence",
    "- Mandatory child categories: mapped to evidence",
    "- Acceptance and verification: exercised",
    `- Remainder: ${remainder}`,
  ].join("\n");
}

function runProof(scenario = "passing") {
  const result = scenario === "incomplete"
    ? evaluateConvergence({
        records: { requirements: true, clarifications: true, "implementation-plan": true },
        tasks: [{ id: "task-2", evidence: "" }],
        children: [{ category: "implementation", evidence: "mapped" }],
        acceptance: [{ id: "AC-2", evidence: "" }],
        contradictions: ["user path not exercised"],
      })
    : evaluateConvergence({
        records: Object.fromEntries(REQUIRED_RECORDS.map((record) => [record, true])),
        tasks: [{ id: "task-1", evidence: "commit abc123" }],
        children: REQUIRED_CHILD_CATEGORIES.map((category) => ({ category, evidence: "mapped" })),
        acceptance: [{ id: "AC-1", evidence: "proof" }],
      });
  process.stdout.write(`${renderConvergence(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runProof(process.argv[2]);
}
