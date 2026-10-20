import { declareEvidence, evidenceValues, normalizedIdentifier, REQUIRED_RECORDS } from "./convergence-core.mjs";

// Each rule names one way a task can be mapped wrong, paired with the remainder
// message for it. The first matching rule wins, so one cause never yields two
// remainders. Order is the contract: the tests pin it.
const TASK_MAPPING_RULES = [
  [({ task, slice }) => task.child !== undefined && !slice, () => "needs a functional slice id"],
  [
    ({ task }) => task.parentLevel !== undefined && task.parentLevel !== "convergence",
    () => "uses an unknown parent-level marker",
  ],
  [
    ({ task, slice }) => slice && task.parentLevel === "convergence",
    () => "cannot combine a functional slice with the parent-level convergence marker",
  ],
  [({ slice, childIds }) => slice && !childIds.has(slice), (slice) => `references missing functional slice ${slice}`],
  [
    ({ task, slice }) => !slice && task.parentLevel !== "convergence",
    () => "needs a functional slice or parent-level convergence marker",
  ],
  [
    ({ task, slice }) => task.independent === true && !slice,
    () => "is marked independent but has no linked child issue",
  ],
];

function taskMappingProblem({ task, slice, childIds }) {
  const rule = TASK_MAPPING_RULES.find(([matches]) => matches({ task, slice, childIds }));
  if (!rule) {
    return null;
  }
  return rule[1](slice);
}

function validateTaskMapping({ task, taskId, childIds, addRemainder }) {
  const slice = normalizedIdentifier(task.child);
  const problem = taskMappingProblem({ task, slice, childIds });
  if (problem) {
    addRemainder("Functional decomposition", `${taskId ?? "task"} ${problem}`);
  }
}

const PLAN_RECORDS = new Set(["implementation-plan", "task-list"]);

function recordSection(record) {
  if (PLAN_RECORDS.has(record)) {
    return "Plan and tasks";
  }
  return "Requirements and clarifications";
}

function missingRecords(recordMap, addRemainder) {
  for (const record of REQUIRED_RECORDS) {
    if (!recordMap[record]) {
      addRemainder(recordSection(record), `missing ${record} record`);
    }
  }
}

function indexTask({ task, index, seenTaskIds, normalizedTaskIds, addRemainder }) {
  const taskId = normalizedIdentifier(task.id);
  if (!taskId) {
    addRemainder("Plan and tasks", `task entry ${index + 1} needs a non-empty id`);
    return;
  }
  normalizedTaskIds.set(task, taskId);
  if (seenTaskIds.has(taskId)) {
    addRemainder("Plan and tasks", `${taskId} task id is declared more than once`);
  }
  seenTaskIds.add(taskId);
  if (evidenceValues(task.evidence).length === 0) {
    addRemainder("Plan and tasks", `${taskId} needs implementation evidence`);
  }
}

function indexTasks(taskList, addRemainder) {
  const seenTaskIds = new Set();
  const normalizedTaskIds = new Map();
  for (const [index, task] of taskList.entries()) {
    indexTask({ task, index, seenTaskIds, normalizedTaskIds, addRemainder });
  }
  return { normalizedTaskIds, seenTaskIds };
}

function declareTaskEvidence({ taskList, normalizedTaskIds, evidenceOwners, addRemainder }) {
  for (const task of taskList) {
    const taskId = normalizedTaskIds.get(task);
    if (taskId) {
      declareEvidence({ owner: taskId, value: task.evidence, section: "Plan and tasks", evidenceOwners, addRemainder });
    }
  }
}

function childSliceId(child) {
  return normalizedIdentifier(child.slice ?? child.name ?? child.id);
}

// Claims a slice id for this child. Returns the message when the id is missing
// or already linked, and null after recording a fresh id.
function claimChildSlice({ slice, childIds }) {
  if (!slice) {
    return "linked child needs a functional slice id";
  }
  if (childIds.has(slice)) {
    return `${slice} functional slice is linked more than once`;
  }
  childIds.add(slice);
  return null;
}

function indexChild({ child, childIds, evidenceOwners, addRemainder }) {
  const slice = childSliceId(child);
  const claimProblem = claimChildSlice({ slice, childIds });
  if (claimProblem) {
    addRemainder("Functional decomposition", claimProblem);
    return;
  }
  if (evidenceValues(child.evidence).length === 0) {
    addRemainder("Functional decomposition", `${slice} slice needs evidence`);
    return;
  }
  declareEvidence({
    owner: slice,
    value: child.evidence,
    section: "Functional decomposition",
    evidenceOwners,
    addRemainder,
  });
}

function indexChildren(childList, evidenceOwners, addRemainder) {
  const childIds = new Set();
  for (const child of childList) {
    indexChild({ child, childIds, evidenceOwners, addRemainder });
  }
  return childIds;
}

function checkTaskMappings({ taskList, normalizedTaskIds, childIds, addRemainder }) {
  for (const task of taskList) {
    validateTaskMapping({ task, taskId: normalizedTaskIds.get(task), childIds, addRemainder });
  }
}

function addSliceOwner({ task, taskOwners, addRemainder }) {
  const slice = normalizedIdentifier(task.child);
  if (!slice) {
    return;
  }
  if (taskOwners.has(slice)) {
    addRemainder("Functional decomposition", `${slice} slice has more than one owning task`);
    return;
  }
  taskOwners.add(slice);
}

function checkSliceOwnership(taskList, childIds, addRemainder) {
  const taskOwners = new Set();
  for (const task of taskList) {
    addSliceOwner({ task, taskOwners, addRemainder });
  }
  for (const slice of childIds) {
    if (!taskOwners.has(slice)) {
      addRemainder("Functional decomposition", `${slice} slice needs an owning task`);
    }
  }
}

function checkIdCollisions(seenTaskIds, childIds, addRemainder) {
  for (const taskId of seenTaskIds) {
    if (childIds.has(taskId)) {
      addRemainder("Functional decomposition", `${taskId} is both a task id and a functional slice id`);
    }
  }
}

// Runs the plan-side checks in their pinned order and returns the indexes the
// later phases read. The remainder order is the one the tests pin.
export function planPhase({ recordMap, taskList, childList, addRemainder }) {
  missingRecords(recordMap, addRemainder);
  const { normalizedTaskIds, seenTaskIds } = indexTasks(taskList, addRemainder);
  const evidenceOwners = new Map();
  declareTaskEvidence({ taskList, normalizedTaskIds, evidenceOwners, addRemainder });
  const childIds = indexChildren(childList, evidenceOwners, addRemainder);
  checkTaskMappings({ taskList, normalizedTaskIds, childIds, addRemainder });
  checkSliceOwnership(taskList, childIds, addRemainder);
  checkIdCollisions(seenTaskIds, childIds, addRemainder);
  return { normalizedTaskIds, seenTaskIds, childIds, evidenceOwners };
}
