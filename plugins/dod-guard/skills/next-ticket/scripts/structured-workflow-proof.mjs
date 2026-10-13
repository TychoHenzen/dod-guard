import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTANCE_MATRIX_PATHS,
  validateAcceptanceMatrix,
} from "../../../lib/acceptance-matrix.mjs";

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

// Returns the one task that owns a lens, or null after naming why the lens
// cannot be owned yet.
function lensOwnerTask({ id, lens, taskList, normalizedTaskIds, addRemainder }) {
  const section = "Functional decomposition";
  if (!lens.owner || evidenceValues(lens.evidence).length === 0) {
    addRemainder(section, `${id} review lens needs an owner and evidence`);
    return null;
  }
  if (evidenceValues(lens.acceptanceEvidence).length === 0 || evidenceValues(lens.verificationEvidence).length === 0) {
    addRemainder(section, `${id} review lens needs acceptance and verification evidence`);
    return null;
  }
  const owner = normalizedIdentifier(lens.owner);
  const taskIdOwners = taskList.filter((task) => normalizedTaskIds.get(task) === owner);
  const ownerTasks =
    taskIdOwners.length > 0 ? taskIdOwners : taskList.filter((task) => normalizedIdentifier(task.child) === owner);
  if (ownerTasks.length !== 1) {
    const problem = ownerTasks.length === 0 ? "missing" : "ambiguous";
    addRemainder(section, `${id} review lens references ${problem} owner ${lens.owner}`);
    return null;
  }
  return ownerTasks[0];
}

// Returns the lens id the first time a known lens appears, else null after
// naming the problem.
function firstLensId(lens, seenLenses, addRemainder) {
  const id = normalizedIdentifier(lens.id ?? lens.name);
  if (!id || !REQUIRED_REVIEW_LENSES.includes(id)) {
    addRemainder("Functional decomposition", "review-lens ownership uses an unknown lens");
    return null;
  }
  if (seenLenses.has(id)) {
    addRemainder("Functional decomposition", `${id} review lens is declared more than once`);
    return null;
  }
  seenLenses.add(id);
  return id;
}

function claimLensEvidence(id, lens, lensEvidenceOwners, addRemainder) {
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

// The lens checks that need no acceptance matrix. Returns each owned lens with
// its owner task for the lens-row phase.
function validateReviewLenses({ lensList, taskList, normalizedTaskIds, evidenceOwners, addRemainder }) {
  const section = "Functional decomposition";
  const seenLenses = new Set();
  const lensEvidenceOwners = new Map();
  const ownedLenses = [];
  for (const lens of lensList) {
    const id = firstLensId(lens, seenLenses, addRemainder);
    const ownerTask = id && lensOwnerTask({ id, lens, taskList, normalizedTaskIds, addRemainder });
    if (!ownerTask) continue;
    const owner = normalizedIdentifier(lens.owner);
    const evidenceOwner = normalizedTaskIds.get(ownerTask) === owner ? owner : normalizedIdentifier(ownerTask.child);
    referenceEvidence({ owner: evidenceOwner, value: lens.evidence, section, evidenceOwners, addRemainder });
    claimLensEvidence(id, lens, lensEvidenceOwners, addRemainder);
    ownedLenses.push({ id, lens, ownerTask });
  }
  for (const lens of REQUIRED_REVIEW_LENSES) {
    if (!seenLenses.has(lens)) addRemainder(section, `${lens} review lens needs an owning task`);
  }
  return ownedLenses;
}

// The user paths a lens must prove through rows it owns: wiring/usability is
// the user's own path through the surface, reliability is failure and recovery.
const REQUIRED_LENS_PATHS = Object.freeze({
  "wiring/usability": ["interactive-control", "browser/e2e"],
  reliability: ["data/error", "recovery"],
});

// A lens names its rows twice, by evidence and by proof; both must resolve to
// the same rows.
const LENS_ROW_KINDS = Object.freeze([
  Object.freeze({ name: "acceptance", lensField: "acceptanceEvidence", rowField: "evidence" }),
  Object.freeze({ name: "verification", lensField: "verificationEvidence", rowField: "proof" }),
]);

function observedRowError(row, label, expectedHeadSha) {
  if (expectedHeadSha && row.headSha !== expectedHeadSha) {
    return `${label} is bound to ${row.headSha ?? "no head"}, expected ${expectedHeadSha}`;
  }
  if (row.status !== "pass" && !(row.status === "inapplicable" && row.reason)) {
    return `${label} is bound to non-passing status ${row.status ?? "no status"}`;
  }
  return null;
}

function lensRowError({ id, kind, reference, matches, observed, expectedHeadSha }) {
  if (matches.length === 0) return `${id} review lens references undeclared ${kind.name} evidence ${reference}`;
  const label = `${id} review lens ${kind.name} evidence ${reference}`;
  if (matches.length > 1) return `${label} is mapped to multiple acceptance-matrix rows`;
  return observed ? observedRowError(matches[0], label, expectedHeadSha) : null;
}

function resolveLensRows({ id, kind, lens, rows, observed, expectedHeadSha }) {
  const errors = [];
  const resolved = [];
  const seen = new Set();
  for (const reference of evidenceValues(lens[kind.lensField])) {
    if (seen.has(reference)) {
      errors.push(`${id} review lens ${kind.name} evidence references ${reference} more than once`);
      continue;
    }
    seen.add(reference);
    const matches = rows.filter((row) => row[kind.rowField] === reference);
    const error = lensRowError({ id, kind, reference, matches, observed, expectedHeadSha });
    if (error) errors.push(error);
    else resolved.push(matches[0]);
  }
  return { errors, rows: resolved };
}

function ownerDeclarationErrors(id, kind, lens, ownerTask) {
  const declared = evidenceValues(ownerTask[kind.lensField]);
  const missing = evidenceValues(lens[kind.lensField]).filter((reference) => !declared.includes(reference));
  return missing.length > 0 ? [`${id} owner task needs mapped ${kind.name} evidence ${missing.join(", ")}`] : [];
}

const rowKey = (row) => row.id ?? `row ${row.index + 1}`;

function sameRows(left, right) {
  const rightIndexes = new Set(right.map((row) => row.index));
  return left.length === rightIndexes.size && left.every((row) => rightIndexes.has(row.index));
}

// A lens row must name its required path exactly, ignoring case, as the
// finalization gate did on master. The matrix coverage check in
// acceptance-matrix.mjs also accepts substrings and aliases, so a row such as
// "Recovery after restart" covers the matrix's recovery path but not the
// reliability lens's. Planned and observed mode apply the same two rules, so
// refinement and finalization still agree.
function lensPathErrors(id, rows) {
  const missing = (REQUIRED_LENS_PATHS[id] ?? []).filter(
    (requiredPath) => !rows.some((row) => row.path?.toLowerCase() === requiredPath),
  );
  return missing.length > 0 ? [`${id} review lens must cover required path(s): ${missing.join(", ")}`] : [];
}

function claimRows(id, rows, claimedRows) {
  const errors = [];
  for (const row of rows) {
    const previousLens = claimedRows.get(rowKey(row));
    if (previousLens && previousLens !== id) {
      errors.push(`${id} review lens reuses acceptance-matrix row ${rowKey(row)} already owned by ${previousLens}`);
    } else {
      claimedRows.set(rowKey(row), id);
    }
  }
  return errors;
}

// The one lens-row rule set. Every owned lens must cite rows its owner task
// declares, resolve each reference to exactly one row, use one row for both
// its acceptance and verification evidence, cover its required user paths,
// and claim no row another lens owns. Observed rows must also pass at the
// pushed head; planned rows have no status or head to check yet.
function lensRowRemainder({ ownedLenses, rows, observed, expectedHeadSha }) {
  const remainder = [];
  const claimedRows = new Map();
  for (const { id, lens, ownerTask } of ownedLenses) {
    if (observed && expectedHeadSha && normalizedIdentifier(lens.headSha ?? lens.head) !== expectedHeadSha) {
      remainder.push(`${id} review lens is not bound to handoff head ${expectedHeadSha}`);
    }
    const [acceptance, verification] = LENS_ROW_KINDS.map((kind) => {
      remainder.push(...ownerDeclarationErrors(id, kind, lens, ownerTask));
      return resolveLensRows({ id, kind, lens, rows, observed, expectedHeadSha });
    });
    remainder.push(...acceptance.errors, ...verification.errors);
    if (acceptance.errors.length > 0 || verification.errors.length > 0) continue;
    if (!sameRows(acceptance.rows, verification.rows)) {
      remainder.push(`${id} review lens acceptance and verification evidence must share one acceptance-matrix row`);
      continue;
    }
    remainder.push(...lensPathErrors(id, acceptance.rows), ...claimRows(id, acceptance.rows, claimedRows));
  }
  return remainder;
}

// Every matrix row must be unique and owned by a task or review lens.
function matrixOwnershipErrors(rows, taskList, lensList) {
  const owners = [...taskList, ...lensList];
  const errors = [];
  for (const kind of LENS_ROW_KINDS) {
    const declared = new Set(owners.flatMap((owner) => evidenceValues(owner[kind.lensField])));
    const seen = new Set();
    const label = kind.name === "acceptance" ? "evidence" : "proof";
    for (const value of rows.map((row) => row[kind.rowField]).filter(Boolean)) {
      if (seen.has(value)) errors.push(`acceptance matrix ${label} ${value} is declared more than once`);
      seen.add(value);
      if (!declared.has(value)) {
        errors.push(`acceptance matrix ${label} ${value} is not owned by a task or review lens`);
      }
    }
  }
  return errors;
}

function activeMatrix({ postPushValidation, acceptanceMatrix, plannedAcceptanceMatrix }) {
  if (postPushValidation) return { mode: "observed", matrix: acceptanceMatrix };
  if (plannedAcceptanceMatrix !== null && plannedAcceptanceMatrix !== undefined) {
    return { mode: "planned", matrix: plannedAcceptanceMatrix };
  }
  return null;
}

function validateMatrixPhase(phase) {
  const { active, expectedHeadSha, acceptanceList, taskList, lensList, ownedLenses, addRemainder } = phase;
  const validation = validateAcceptanceMatrix({
    matrix: active.matrix,
    headSha: expectedHeadSha,
    requiredContracts: acceptanceList,
    requiredPaths: ACCEPTANCE_MATRIX_PATHS,
    mode: active.mode,
  });
  for (const error of validation.errors) addRemainder("Acceptance and verification", `acceptance matrix: ${error}`);
  for (const error of matrixOwnershipErrors(validation.rows, taskList, lensList)) {
    addRemainder("Acceptance and verification", error);
  }
  const observed = active.mode === "observed";
  for (const error of lensRowRemainder({ ownedLenses, rows: validation.rows, observed, expectedHeadSha })) {
    addRemainder("Functional decomposition", error);
  }
}

const PROOF_HANDOFF = {
  url: "https://github.com/owner/repo/issues/1#issuecomment-1",
  headSha: "abc1234",
};

const PROOF_ACCEPTANCE_MATRIX = [...ACCEPTANCE_MATRIX_PATHS, "quality"].map((pathName, index) => ({
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
  plannedAcceptanceMatrix = null,
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
  validateLensOwnershipRecord(recordMap["lens-ownership"], lensList, "Functional decomposition", addRemainder);
  const ownedLenses = validateReviewLenses({ lensList, taskList, normalizedTaskIds, evidenceOwners, addRemainder });
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
  // After push the observed matrix is checked at the exact head. Before push a
  // planned matrix, when supplied, gets the same lens-row rules without the
  // status and head checks. With neither, the matrix and lens-row checks wait.
  const active = activeMatrix({ postPushValidation, acceptanceMatrix, plannedAcceptanceMatrix });
  if (active) {
    validateMatrixPhase({ active, expectedHeadSha, acceptanceList, taskList, lensList, ownedLenses, addRemainder });
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
        : id === "reliability" ? ["evidence-4", "evidence-5"] : id === "quality"
          ? "evidence-6" : `evidence-${index + 1}`,
      verificationEvidence: id === "wiring/usability"
        ? ["proof-2", "proof-3"]
        : id === "reliability" ? ["proof-4", "proof-5"] : id === "quality"
          ? "proof-6" : `proof-${index + 1}`,
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
