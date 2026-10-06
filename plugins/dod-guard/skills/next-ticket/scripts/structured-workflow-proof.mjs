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
  const result = [];
  const pending = [value];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      const evidence = current.trim();
      if (evidence) result.push(evidence);
    } else if (Array.isArray(current) && !visited.has(current)) {
      visited.add(current);
      pending.push(...current);
    }
  }
  return result.reverse();
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

function lensSignature(lens) {
  return JSON.stringify({
    id: normalizedIdentifier(lens.id ?? lens.name),
    owner: normalizedIdentifier(lens.owner),
    evidence: evidenceValues(lens.evidence).sort(),
    headSha: normalizedIdentifier(lens.headSha ?? lens.head),
    acceptanceEvidence: evidenceValues(lens.acceptanceEvidence).sort(),
    verificationEvidence: evidenceValues(lens.verificationEvidence).sort(),
  });
}

function validateLensOwnershipRecord(record, reviewLenses, section, addRemainder) {
  if (!Array.isArray(record)) {
    addRemainder(section, "lens-ownership record must be an array of review lenses");
    return;
  }
  const recordById = new Map();
  for (const [index, lens] of record.entries()) {
    if (!lens || typeof lens !== "object" || Array.isArray(lens)) {
      addRemainder(section, `lens-ownership entry ${index + 1} must be an object`);
      continue;
    }
    const id = normalizedIdentifier(lens?.id ?? lens?.name);
    if (!id) {
      addRemainder(section, `lens-ownership entry ${index + 1} needs a non-empty id`);
    } else if (recordById.has(id)) {
      addRemainder(section, `${id} lens-ownership entry is declared more than once`);
    } else {
      recordById.set(id, lens);
    }
  }
  const reviewById = new Map();
  for (const lens of reviewLenses) {
    const id = normalizedIdentifier(lens.id ?? lens.name);
    if (id) reviewById.set(id, lens);
  }
  for (const requiredLens of REQUIRED_REVIEW_LENSES) {
    const recordLens = recordById.get(requiredLens);
    const reviewLens = reviewById.get(requiredLens);
    if (!recordLens) {
      addRemainder(section, `${requiredLens} lens-ownership record is missing`);
    } else if (!reviewLens || lensSignature(recordLens) !== lensSignature(reviewLens)) {
      addRemainder(section, `${requiredLens} lens-ownership record does not match review-lens evidence`);
    }
  }
  for (const id of recordById.keys()) {
    if (!REQUIRED_REVIEW_LENSES.includes(id)) {
      addRemainder(section, `${id} lens-ownership record uses an unknown lens`);
    }
  }
}

function validateTaskMapping({ task, taskId, childIds, addRemainder }) {
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
  reviewLenses = null,
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
  const recordMap = records && typeof records === "object" && !Array.isArray(records) ? records : {};
  const addRemainder = (section, message) => {
    sections[section].push(message);
    remainder.push(message);
  };
  const expectedHeadSha = normalizedIdentifier(headSha);
  const postPushValidation =
    expectedHeadSha !== null || (acceptanceMatrix !== null && acceptanceMatrix !== undefined);
  if (postPushValidation && !expectedHeadSha) {
    addRemainder("Acceptance and verification", "structured convergence needs an exact pushed head");
  }
  if (postPushValidation && acceptanceMatrix === null) {
    addRemainder("Acceptance and verification", "structured convergence needs an acceptance matrix");
  }

  const taskList = normalizeEntries(tasks, "task", "Plan and tasks", addRemainder);
  const childList = normalizeEntries(children, "child", "Functional decomposition", addRemainder);
  const lensList = normalizeEntries(
    reviewLenses ?? recordMap["lens-ownership"] ?? [],
    "review lens",
    "Functional decomposition",
    addRemainder,
  );
  const acceptanceList = normalizeEntries(acceptance, "acceptance criterion", "Acceptance and verification", addRemainder);

  for (const record of REQUIRED_RECORDS) {
    if (!recordMap[record]) {
      addRemainder(
        record === "implementation-plan" || record === "task-list"
          ? "Plan and tasks"
          : "Requirements and clarifications",
        `missing ${record} record`,
      );
    }
  }
  const seenTaskIds = new Set();
  const normalizedTaskIds = new Map();
  for (const [index, task] of taskList.entries()) {
    const taskId = normalizedIdentifier(task.id);
    if (!taskId) {
      addRemainder("Plan and tasks", `task entry ${index + 1} needs a non-empty id`);
      continue;
    }
    normalizedTaskIds.set(task, taskId);
    if (seenTaskIds.has(taskId)) {
      addRemainder("Plan and tasks", `${taskId} task id is declared more than once`);
    } else {
      seenTaskIds.add(taskId);
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
    const slice = normalizedIdentifier(child.slice ?? child.name ?? child.id);
    if (!slice) {
      addRemainder("Functional decomposition", "linked child needs a functional slice id");
    } else if (childIds.has(slice)) {
      addRemainder("Functional decomposition", `${slice} functional slice is linked more than once`);
    } else {
      childIds.add(slice);
      if (evidenceValues(child.evidence).length === 0) {
        addRemainder("Functional decomposition", `${slice} slice needs evidence`);
      } else {
        declareEvidence({
          owner: slice,
          value: child.evidence,
          section: "Functional decomposition",
          evidenceOwners,
          addRemainder,
        });
      }
    }
  }
  for (const task of taskList) {
    validateTaskMapping({
      task,
      taskId: normalizedTaskIds.get(task),
      childIds,
      addRemainder,
    });
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
  for (const taskId of seenTaskIds) {
    if (childIds.has(taskId)) {
      addRemainder("Functional decomposition", `${taskId} is both a task id and a functional slice id`);
    }
  }
  const seenLenses = new Set();
  const lensEvidenceOwners = new Map();
  const matrixEvidence = new Set(
    (Array.isArray(acceptanceMatrix) ? acceptanceMatrix : [])
      .map((row) => normalizedIdentifier(row?.evidence))
      .filter(Boolean),
  );
  const matrixProofs = new Set(
    (Array.isArray(acceptanceMatrix) ? acceptanceMatrix : [])
      .map((row) => normalizedIdentifier(row?.proof))
      .filter(Boolean),
  );
  validateLensOwnershipRecord(
    recordMap["lens-ownership"],
    lensList,
    "Functional decomposition",
    addRemainder,
  );
  for (const lens of lensList) {
    const id = normalizedIdentifier(lens.id ?? lens.name);
    if (!id || !REQUIRED_REVIEW_LENSES.includes(id)) {
      addRemainder("Functional decomposition", "review-lens ownership uses an unknown lens");
    } else if (seenLenses.has(id)) {
      addRemainder("Functional decomposition", `${id} review lens is declared more than once`);
    } else {
      seenLenses.add(id);
      const lensHeadSha = normalizedIdentifier(lens.headSha ?? lens.head);
      const missingAcceptanceEvidence = evidenceValues(lens.acceptanceEvidence).length === 0;
      const missingVerificationEvidence = evidenceValues(lens.verificationEvidence).length === 0;
      if (!lens.owner || evidenceValues(lens.evidence).length === 0) {
        addRemainder("Functional decomposition", `${id} review lens needs an owner and evidence`);
      } else if (missingAcceptanceEvidence || missingVerificationEvidence) {
        addRemainder("Functional decomposition", `${id} review lens needs acceptance and verification evidence`);
      } else if (postPushValidation && lensHeadSha !== expectedHeadSha) {
        addRemainder("Functional decomposition", `${id} review lens evidence is bound to ${lensHeadSha ?? "no head"}, expected ${expectedHeadSha ?? "an exact pushed head"}`);
      } else {
        const owner = normalizedIdentifier(lens.owner);
        const taskIdOwners = taskList.filter((task) => normalizedTaskIds.get(task) === owner);
        const ownerTasks = taskIdOwners.length > 0
          ? taskIdOwners
          : taskList.filter((task) => normalizedIdentifier(task.child) === owner);
        if (ownerTasks.length === 0) {
          addRemainder("Functional decomposition", `${id} review lens references missing owner ${lens.owner}`);
        } else if (ownerTasks.length > 1) {
          addRemainder("Functional decomposition", `${id} review lens references ambiguous owner ${lens.owner}`);
        } else {
          const [ownerTask] = ownerTasks;
          const evidenceOwner = normalizedTaskIds.get(ownerTask) === owner ? owner : normalizedIdentifier(ownerTask.child);
          if (postPushValidation) {
            for (const evidence of evidenceValues(lens.acceptanceEvidence)) {
              if (!matrixEvidence.has(evidence)) {
                addRemainder("Functional decomposition", `${id} review lens references undeclared acceptance evidence ${evidence}`);
              }
              if (!evidenceValues(ownerTask.acceptanceEvidence).includes(evidence)) {
                addRemainder("Functional decomposition", `${id} owner task does not declare acceptance evidence ${evidence}`);
              }
            }
            for (const evidence of evidenceValues(lens.verificationEvidence)) {
              if (!matrixProofs.has(evidence)) {
                addRemainder("Functional decomposition", `${id} review lens references undeclared verification evidence ${evidence}`);
              }
              if (!evidenceValues(ownerTask.verificationEvidence).includes(evidence)) {
                addRemainder("Functional decomposition", `${id} owner task does not declare verification evidence ${evidence}`);
              }
            }
          }
          referenceEvidence({
            owner: evidenceOwner,
            value: lens.evidence,
            section: "Functional decomposition",
            evidenceOwners,
            addRemainder,
          });
          for (const evidence of evidenceValues(lens.evidence)) {
            const previousLens = lensEvidenceOwners.get(evidence);
            if (previousLens) {
              addRemainder(
                "Functional decomposition",
                `${id} reuses evidence ${evidence} already assigned to ${previousLens} review lens`,
              );
            } else {
              lensEvidenceOwners.set(evidence, id);
            }
          }
        }
      }
    }
  }
  for (const lens of REQUIRED_REVIEW_LENSES) {
    if (!seenLenses.has(lens)) {
      addRemainder("Functional decomposition", `${lens} review lens needs an owning task`);
    }
  }
  if (postPushValidation && Array.isArray(acceptanceMatrix)) {
    const seenMatrixEvidence = new Set();
    const seenMatrixProofs = new Set();
    for (const row of acceptanceMatrix) {
      const evidence = normalizedIdentifier(row?.evidence);
      const proof = normalizedIdentifier(row?.proof);
      if (evidence && seenMatrixEvidence.has(evidence)) {
        addRemainder("Acceptance and verification", `acceptance matrix evidence ${evidence} is declared more than once`);
      } else if (evidence) {
        seenMatrixEvidence.add(evidence);
      }
      if (proof && seenMatrixProofs.has(proof)) {
        addRemainder("Acceptance and verification", `acceptance matrix proof ${proof} is declared more than once`);
      } else if (proof) {
        seenMatrixProofs.add(proof);
      }
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
  if (postPushValidation) {
    const matrixValidation = validateAcceptanceMatrix({
      matrix: acceptanceMatrix,
      headSha: expectedHeadSha,
      requiredContracts: acceptanceList,
      requiredPaths: ACCEPTANCE_MATRIX_PATHS,
    });
    for (const error of matrixValidation.errors) {
      addRemainder("Acceptance and verification", `acceptance matrix: ${error}`);
    }
  }
  for (const contradiction of contradictions) {
    addRemainder("Acceptance and verification", contradiction);
  }

  const missingTask = taskList.find((task) => evidenceValues(task.evidence).length === 0);
  const nextAction = missingTask
    ? {
      task: normalizedTaskIds.get(missingTask) ?? missingTask.id,
      owner: normalizedIdentifier(missingTask.child) ?? "implementation",
    }
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
    const reviewLenses = REQUIRED_REVIEW_LENSES.map((id, index) => ({
      id,
      owner: "task-1",
      evidence: `lens-${id}`,
      headSha: PROOF_HANDOFF.headSha,
      acceptanceEvidence: id === "wiring/usability"
        ? ["evidence-2", "evidence-3"]
        : id === "reliability" ? ["evidence-4", "evidence-5"] : `evidence-${index + 1}`,
      verificationEvidence: id === "wiring/usability"
        ? ["proof-2", "proof-3"]
        : id === "reliability" ? ["proof-4", "proof-5"] : `proof-${index + 1}`,
    }));
    return evaluateConvergence({
      records: Object.fromEntries(REQUIRED_RECORDS.map((record) => [
        record,
        record === "lens-ownership" ? reviewLenses : true,
      ])),
      tasks: [{
        id: "task-1",
        child: "search-flow",
        evidence: [
          "commit abc123",
          ...REQUIRED_REVIEW_LENSES.map((id) => `lens-${id}`),
        ],
        acceptanceEvidence: PROOF_ACCEPTANCE_MATRIX.map((row) => row.evidence),
        verificationEvidence: PROOF_ACCEPTANCE_MATRIX.map((row) => row.proof),
      }],
      children: [{ id: "search-flow", evidence: "mapped" }],
      reviewLenses,
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
