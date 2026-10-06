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

function evidenceValues(value) {
  if (typeof value === "string") {
    const evidence = value.trim();
    return evidence ? [evidence] : [];
  }
  if (Array.isArray(value)) return value.flatMap(evidenceValues);
  return [];
}

function normalizedIdentifier(value) {
  if (typeof value !== "string") return null;
  const identifier = value.trim();
  return identifier ? identifier : null;
}

function normalizeEntries(value, label, section, addRemainder) {
  if (!Array.isArray(value)) {
    addRemainder(section, `${label} must be an array`);
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      addRemainder(section, `${label} entry ${index + 1} must be an object`);
      return [];
    }
    return [entry];
  });
}

function declareEvidence({ owner, value, section, evidenceOwners, addRemainder }) {
  for (const evidence of evidenceValues(value)) {
    if (evidenceOwners.has(evidence)) {
      const previousOwner = evidenceOwners.get(evidence);
      addRemainder(section, `evidence ${evidence} is mapped more than once (${previousOwner}, ${owner})`);
    } else {
      evidenceOwners.set(evidence, owner);
    }
  }
}

function referenceEvidence({ owner, value, section, evidenceOwners, addRemainder }) {
  const referencedEvidence = new Set();
  for (const evidence of evidenceValues(value)) {
    if (referencedEvidence.has(evidence)) {
      addRemainder(section, `${owner} references evidence ${evidence} more than once`);
    } else if (!evidenceOwners.has(evidence)) {
      addRemainder(section, `${owner} references undeclared evidence ${evidence}`);
    } else if (evidenceOwners.get(evidence) !== owner) {
      const declaredOwner = evidenceOwners.get(evidence);
      addRemainder(section, `${owner} references evidence owned by ${declaredOwner}`);
    }
    referencedEvidence.add(evidence);
  }
}

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

  const taskList = normalizeEntries(tasks, "task", "Plan and tasks", addRemainder);
  const childList = normalizeEntries(children, "child", "Functional decomposition", addRemainder);
  const lensList = normalizeEntries(reviewLenses, "review lens", "Functional decomposition", addRemainder);
  const acceptanceList = normalizeEntries(acceptance, "acceptance criterion", "Acceptance and verification", addRemainder);

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
  const validTaskIds = new Set();
  const normalizedTaskIds = new Map();
  for (const [index, task] of taskList.entries()) {
    const taskId = normalizedIdentifier(task.id);
    if (!taskId) {
      addRemainder("Plan and tasks", `task entry ${index + 1} needs a non-empty id`);
      continue;
    }
    normalizedTaskIds.set(task, taskId);
    if (validTaskIds.has(taskId)) {
      addRemainder("Plan and tasks", `${taskId} task id is declared more than once`);
    } else {
      validTaskIds.add(taskId);
    }
    if (evidenceValues(task.evidence).length === 0) {
      addRemainder("Plan and tasks", `${taskId} needs implementation evidence`);
    }
  }
  const evidenceOwners = new Map();
  for (const task of taskList) {
    const taskId = normalizedTaskIds.get(task);
    if (taskId) {
      declareEvidence({
        owner: taskId,
        value: task.evidence,
        section: "Plan and tasks",
        evidenceOwners,
        addRemainder,
      });
    }
  }
  const childIds = new Set();
  for (const child of childList) {
    const slice = normalizedIdentifier(child.id ?? child.slice ?? child.name);
    if (!slice) {
      addRemainder("Functional decomposition", "linked child needs a functional slice id");
    } else if (childIds.has(slice)) {
      addRemainder("Functional decomposition", `${slice} functional slice is linked more than once`);
    } else {
      childIds.add(slice);
      if (evidenceValues(child.evidence).length === 0) {
        addRemainder("Functional decomposition", `${slice} slice needs evidence`);
      } else {
        declareEvidence({ owner: slice, value: child.evidence, section: "Functional decomposition", evidenceOwners, addRemainder });
      }
    }
  }
  for (const task of taskList) {
    const taskId = normalizedTaskIds.get(task);
    const slice = normalizedIdentifier(task.child);
    if (task.child !== undefined && !slice) {
      addRemainder("Functional decomposition", `${taskId ?? "task"} needs a functional slice id`);
    } else if (task.parentLevel !== undefined && task.parentLevel !== "convergence") {
      addRemainder("Functional decomposition", `${taskId ?? "task"} uses an unknown parent-level marker`);
    } else if (slice && task.parentLevel === "convergence") {
      addRemainder("Functional decomposition", `${taskId ?? "task"} cannot combine a functional slice with the parent-level convergence marker`);
    } else if (slice && !childIds.has(slice)) {
      addRemainder("Functional decomposition", `${taskId ?? "task"} references missing functional slice ${slice}`);
    } else if (!slice && task.parentLevel !== "convergence") {
      addRemainder(
        "Functional decomposition",
        `${taskId ?? "task"} needs a functional slice or parent-level convergence marker`,
      );
    }
  }
  const taskOwners = new Set();
  for (const task of taskList) {
    const slice = normalizedIdentifier(task.child);
    if (slice && taskOwners.has(slice)) {
      addRemainder("Functional decomposition", `${slice} slice has more than one owning task`);
    } else if (slice) {
      taskOwners.add(slice);
    }
  }
  for (const slice of childIds) {
    if (!taskOwners.has(slice)) {
      addRemainder("Functional decomposition", `${slice} slice needs an owning task`);
    }
  }
  const seenLenses = new Set();
  for (const lens of lensList) {
    const id = normalizedIdentifier(lens.id ?? lens.name);
    if (!id || !REQUIRED_REVIEW_LENSES.includes(id)) {
      addRemainder("Functional decomposition", "review-lens ownership uses an unknown lens");
    } else if (seenLenses.has(id)) {
      addRemainder("Functional decomposition", `${id} review lens is declared more than once`);
    } else {
      seenLenses.add(id);
      if (!lens.owner || evidenceValues(lens.evidence).length === 0) {
        addRemainder("Functional decomposition", `${id} review lens needs an owner and evidence`);
      } else {
        const owner = normalizedIdentifier(lens.owner);
        const ownerTasks = taskList.filter(
          (task) => {
            const taskId = normalizedTaskIds.get(task);
            return taskId && (taskId === owner || normalizedIdentifier(task.child) === owner);
          },
        );
        if (ownerTasks.length === 0) {
          addRemainder("Functional decomposition", `${id} review lens references missing owner ${lens.owner}`);
        } else if (ownerTasks.length > 1) {
          addRemainder("Functional decomposition", `${id} review lens references ambiguous owner ${lens.owner}`);
        } else {
          const [ownerTask] = ownerTasks;
          const evidenceOwner = normalizedTaskIds.get(ownerTask) === owner ? owner : normalizedIdentifier(ownerTask.child);
          referenceEvidence({
            owner: evidenceOwner,
            value: lens.evidence,
            section: "Functional decomposition",
            evidenceOwners,
            addRemainder,
          });
        }
      }
    }
  }
  for (const lens of REQUIRED_REVIEW_LENSES) {
    if (!seenLenses.has(lens)) {
      addRemainder("Functional decomposition", `${lens} review lens needs an owning task`);
    }
  }
  const seenAcceptanceIds = new Set();
  for (const [index, criterion] of acceptanceList.entries()) {
    const criterionId = normalizedIdentifier(criterion.id);
    if (!criterionId) {
      addRemainder("Acceptance and verification", `acceptance criterion ${index + 1} needs a non-empty id`);
    } else if (seenAcceptanceIds.has(criterionId)) {
      addRemainder("Acceptance and verification", `${criterionId} acceptance criterion is declared more than once`);
    } else {
      seenAcceptanceIds.add(criterionId);
      if (evidenceValues(criterion.evidence).length === 0) {
        addRemainder("Acceptance and verification", `${criterionId} needs fresh evidence`);
      } else {
        declareEvidence({
          owner: criterionId,
          value: criterion.evidence,
          section: "Acceptance and verification",
          evidenceOwners,
          addRemainder,
        });
      }
    }
  }
  const matrixValidation = validateAcceptanceMatrix({
    matrix: acceptanceMatrix,
    headSha,
    requiredContracts: acceptanceList,
    requiredPaths: ACCEPTANCE_MATRIX_PATHS,
  });
  for (const error of matrixValidation.errors) {
    addRemainder("Acceptance and verification", `acceptance matrix: ${error}`);
  }
  for (const contradiction of contradictions) {
    addRemainder("Acceptance and verification", contradiction);
  }

  const missingTask = taskList.find((task) => evidenceValues(task.evidence).length === 0);
  const nextAction = missingTask
    ? { task: normalizedTaskIds.get(missingTask) ?? missingTask.id, owner: missingTask.child ?? "implementation" }
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
      reviewLenses: [{ id: "implementation", owner: "task-2", evidence: "lens-implementation" }],
      acceptance: [{ id: "AC-2", evidence: "" }],
      contradictions: ["user path not exercised"],
    });
  }
  if (scenario === "passing") {
    return evaluateConvergence({
      records: Object.fromEntries(REQUIRED_RECORDS.map((record) => [record, true])),
      tasks: [{
        id: "task-1",
        child: "search-flow",
        evidence: [
          "commit abc123",
          ...REQUIRED_REVIEW_LENSES.filter((id) => id !== "implementation").map((id) => `lens-${id}`),
        ],
      }],
      children: [{ id: "search-flow", evidence: ["mapped", "lens-implementation"] }],
      reviewLenses: REQUIRED_REVIEW_LENSES.map((id, index) => ({
        id,
        owner: index === 0 ? "search-flow" : "task-1",
        evidence: `lens-${id}`,
      })),
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
