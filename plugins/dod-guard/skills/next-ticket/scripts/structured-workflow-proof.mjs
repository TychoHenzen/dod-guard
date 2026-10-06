import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTANCE_MATRIX_PATHS,
  validateAcceptanceMatrix,
} from "../../goal-sdlc/scripts/lib/acceptance-matrix.mjs";

export const REQUIRED_RECORDS = [
  "requirements",
  "clarifications",
  "implementation-plan",
  "task-list",
  "lens-ownership",
];

export const REQUIRED_REVIEW_LENSES = [
  "implementation",
  "wiring/usability",
  "quality",
  "reliability",
];

export const PROOF_SCENARIOS = ["passing", "incomplete", "ordinary"];

const PROOF_HANDOFF = {
  url: "https://github.com/owner/repo/issues/1#issuecomment-1",
  headSha: "abc1234",
};

const PROOF_ACCEPTANCE_MATRIX = ACCEPTANCE_MATRIX_PATHS.map((pathName, index) => ({
  id: `AC-1-${index + 1}`,
  contract: "AC-1",
  path: pathName,
  proof: `proof-${index + 1}`,
  expected: `expected-${index + 1}`,
  observed: `observed-${index + 1}`,
  status: "pass",
  evidence: `evidence-${index + 1}`,
  headSha: PROOF_HANDOFF.headSha,
}));

export function evaluateConvergence({
  path: deliveryPath = "structured",
  records = {},
  tasks = [],
  children = [],
  reviewLenses = [],
  acceptance = [],
  acceptanceMatrix = null,
  headSha = null,
  contradictions = [],
}) {
  if (deliveryPath === "ordinary") {
    return { outcome: "ordinary", remainder: [] };
  }

  const sections = {
    "Requirements and clarifications": [],
    "Plan and tasks": [],
    "Functional decomposition": [],
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
  const childIds = new Set();
  for (const child of children) {
    const slice = child.id ?? child.slice ?? child.name;
    if (!slice) {
      addRemainder("Functional decomposition", "linked child needs a functional slice id");
    } else if (childIds.has(slice)) {
      addRemainder("Functional decomposition", `${slice} functional slice is linked more than once`);
    } else {
      childIds.add(slice);
      if (!child.evidence) addRemainder("Functional decomposition", `${slice} slice needs evidence`);
    }
  }
  for (const task of tasks) {
    if (task.child && !childIds.has(task.child)) {
      addRemainder("Functional decomposition", `${task.id} references missing functional slice ${task.child}`);
    }
  }
  const taskOwners = new Set();
  for (const task of tasks) {
    if (task.child && taskOwners.has(task.child)) {
      addRemainder("Functional decomposition", `${task.child} slice has more than one owning task`);
    } else if (task.child) {
      taskOwners.add(task.child);
    }
  }
  for (const slice of childIds) {
    if (!taskOwners.has(slice)) {
      addRemainder("Functional decomposition", `${slice} slice needs an owning task`);
    }
  }
  const seenLenses = new Set();
  for (const lens of reviewLenses) {
    const id = lens.id ?? lens.name;
    if (!id || !REQUIRED_REVIEW_LENSES.includes(id)) {
      addRemainder("Functional decomposition", "review-lens ownership uses an unknown lens");
    } else if (seenLenses.has(id)) {
      addRemainder("Functional decomposition", `${id} review lens is declared more than once`);
    } else {
      seenLenses.add(id);
      if (!lens.owner || !lens.evidence) {
        addRemainder("Functional decomposition", `${id} review lens needs an owner and evidence`);
      } else if (!tasks.some((task) => task.id === lens.owner || task.child === lens.owner)) {
        addRemainder("Functional decomposition", `${id} review lens references missing owner ${lens.owner}`);
      }
    }
  }
  for (const lens of REQUIRED_REVIEW_LENSES) {
    if (!seenLenses.has(lens)) {
      addRemainder("Functional decomposition", `${lens} review lens needs an owning task`);
    }
  }
  for (const criterion of acceptance) {
    if (!criterion.evidence) {
      addRemainder("Acceptance and verification", `${criterion.id} needs fresh evidence`);
    }
  }
  const matrixValidation = validateAcceptanceMatrix({
    matrix: acceptanceMatrix,
    headSha,
    requiredContracts: acceptance,
    requiredPaths: ACCEPTANCE_MATRIX_PATHS,
  });
  for (const error of matrixValidation.errors) {
    addRemainder("Acceptance and verification", `acceptance matrix: ${error}`);
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
    `- Functional decomposition: ${sectionStatus("Functional decomposition")}`,
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
      children: [{ id: "implementation", evidence: "mapped" }],
      reviewLenses: [{ id: "implementation", owner: "task-2", evidence: "mapped" }],
      acceptance: [{ id: "AC-2", evidence: "" }],
      contradictions: ["user path not exercised"],
    });
  }
  if (scenario === "passing") {
    return evaluateConvergence({
      records: Object.fromEntries(REQUIRED_RECORDS.map((record) => [record, true])),
      tasks: [{ id: "task-1", child: "search-flow", evidence: "commit abc123" }],
      children: [{ id: "search-flow", evidence: "mapped" }],
      reviewLenses: REQUIRED_REVIEW_LENSES.map((id) => ({ id, owner: "task-1", evidence: "mapped" })),
      acceptance: [{ id: "AC-1", evidence: "proof" }],
      acceptanceMatrix: PROOF_ACCEPTANCE_MATRIX,
      headSha: PROOF_HANDOFF.headSha,
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
