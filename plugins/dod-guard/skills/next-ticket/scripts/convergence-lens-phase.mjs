import {
  evidenceValues,
  normalizedIdentifier,
  REQUIRED_REVIEW_LENSES,
  referenceEvidence,
} from "./convergence-core.mjs";

const SECTION = "Functional decomposition";

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

function isLensObject(lens) {
  return Boolean(lens) && typeof lens === "object" && !Array.isArray(lens);
}

function lensIdOf(lens) {
  return lens.id ?? lens.name;
}

function recordLensProblem({ lens, index, recordById }) {
  if (!isLensObject(lens)) {
    return `lens-ownership entry ${index + 1} must be an object`;
  }
  const id = normalizedIdentifier(lensIdOf(lens));
  if (!id) {
    return `lens-ownership entry ${index + 1} needs a non-empty id`;
  }
  if (recordById.has(id)) {
    return `${id} lens-ownership entry is declared more than once`;
  }
  recordById.set(id, lens);
  return null;
}

function indexRecordLenses({ record, section, addRemainder }) {
  const recordById = new Map();
  for (const [index, lens] of record.entries()) {
    const problem = recordLensProblem({ lens, index, recordById });
    if (problem) {
      addRemainder(section, problem);
    }
  }
  return recordById;
}

function indexReviewLenses(reviewLenses) {
  const reviewById = new Map();
  for (const lens of reviewLenses) {
    const id = normalizedIdentifier(lens.id ?? lens.name);
    if (id) {
      reviewById.set(id, lens);
    }
  }
  return reviewById;
}

function requiredLensProblem({ requiredLens, recordById, reviewById }) {
  const recordLens = recordById.get(requiredLens);
  if (!recordLens) {
    return `${requiredLens} lens-ownership record is missing`;
  }
  const reviewLens = reviewById.get(requiredLens);
  if (!reviewLens || lensSignature(recordLens) !== lensSignature(reviewLens)) {
    return `${requiredLens} lens-ownership record does not match review-lens evidence`;
  }
  return null;
}

function compareRequiredLenses({ recordById, reviewById, section, addRemainder }) {
  for (const requiredLens of REQUIRED_REVIEW_LENSES) {
    const problem = requiredLensProblem({ requiredLens, recordById, reviewById });
    if (problem) {
      addRemainder(section, problem);
    }
  }
}

function unknownLensIds({ recordById, section, addRemainder }) {
  for (const id of recordById.keys()) {
    if (!REQUIRED_REVIEW_LENSES.includes(id)) {
      addRemainder(section, `${id} lens-ownership record uses an unknown lens`);
    }
  }
}

function validateLensOwnershipRecord({ record, reviewLenses, section, addRemainder }) {
  if (!Array.isArray(record)) {
    addRemainder(section, "lens-ownership record must be an array of review lenses");
    return;
  }
  const recordById = indexRecordLenses({ record, section, addRemainder });
  const reviewById = indexReviewLenses(reviewLenses);
  compareRequiredLenses({ recordById, reviewById, section, addRemainder });
  unknownLensIds({ recordById, section, addRemainder });
}

// The lens's owner is the task whose id matches; a child-slice match is the fallback.
function ownerTasksFor(taskList, normalizedTaskIds, owner) {
  const taskIdOwners = taskList.filter((task) => normalizedTaskIds.get(task) === owner);
  if (taskIdOwners.length > 0) {
    return taskIdOwners;
  }
  return taskList.filter((task) => normalizedIdentifier(task.child) === owner);
}

// Returns the message for a lens missing its owner, evidence, or acceptance and
// verification evidence, else null.
function lensEvidenceProblem(id, lens) {
  if (!lens.owner || evidenceValues(lens.evidence).length === 0) {
    return `${id} review lens needs an owner and evidence`;
  }
  if (evidenceValues(lens.acceptanceEvidence).length === 0 || evidenceValues(lens.verificationEvidence).length === 0) {
    return `${id} review lens needs acceptance and verification evidence`;
  }
  return null;
}

function ownerProblemKind(ownerTasks) {
  if (ownerTasks.length === 0) {
    return "missing";
  }
  return "ambiguous";
}

// Returns the one task that owns a lens, or null after naming why the lens
// cannot be owned yet.
function lensOwnerTask({ id, lens, taskList, normalizedTaskIds, addRemainder }) {
  const problem = lensEvidenceProblem(id, lens);
  if (problem) {
    addRemainder(SECTION, problem);
    return null;
  }
  const owner = normalizedIdentifier(lens.owner);
  const ownerTasks = ownerTasksFor(taskList, normalizedTaskIds, owner);
  if (ownerTasks.length === 1) {
    return ownerTasks[0];
  }
  addRemainder(SECTION, `${id} review lens references ${ownerProblemKind(ownerTasks)} owner ${lens.owner}`);
  return null;
}

// Returns the lens id the first time a known lens appears, else null after
// naming the problem.
function knownLensId(lens) {
  const id = normalizedIdentifier(lens.id ?? lens.name);
  if (id && REQUIRED_REVIEW_LENSES.includes(id)) {
    return id;
  }
  return null;
}

function firstLensId(lens, seenLenses, addRemainder) {
  const id = knownLensId(lens);
  if (!id) {
    addRemainder(SECTION, "review-lens ownership uses an unknown lens");
    return null;
  }
  if (seenLenses.has(id)) {
    addRemainder(SECTION, `${id} review lens is declared more than once`);
    return null;
  }
  seenLenses.add(id);
  return id;
}

function claimOneLensEvidence({ id, evidence, lensEvidenceOwners, addRemainder }) {
  const previousLens = lensEvidenceOwners.get(evidence);
  if (!previousLens) {
    lensEvidenceOwners.set(evidence, id);
    return;
  }
  addRemainder(SECTION, `${id} reuses evidence ${evidence} already assigned to ${previousLens} review lens`);
}

function claimLensEvidence({ id, lens, lensEvidenceOwners, addRemainder }) {
  for (const evidence of evidenceValues(lens.evidence)) {
    claimOneLensEvidence({ id, evidence, lensEvidenceOwners, addRemainder });
  }
}

// Evidence is declared under the task id, or under the child slice when the
// lens owner matched the slice instead.
function evidenceOwnerOf({ lens, ownerTask, normalizedTaskIds }) {
  const owner = normalizedIdentifier(lens.owner);
  if (normalizedTaskIds.get(ownerTask) === owner) {
    return owner;
  }
  return normalizedIdentifier(ownerTask.child);
}

// Checks one lens whose id is already known and returns it with its owner task,
// or null when the lens cannot be owned yet.
function recordOwnedLens({ id, lens, taskList, normalizedTaskIds, evidenceOwners, lensEvidenceOwners, addRemainder }) {
  const ownerTask = lensOwnerTask({ id, lens, taskList, normalizedTaskIds, addRemainder });
  if (!ownerTask) {
    return null;
  }
  const evidenceOwner = evidenceOwnerOf({ lens, ownerTask, normalizedTaskIds });
  referenceEvidence({ owner: evidenceOwner, value: lens.evidence, section: SECTION, evidenceOwners, addRemainder });
  claimLensEvidence({ id, lens, lensEvidenceOwners, addRemainder });
  return { id, lens, ownerTask };
}

function missingLensOwners(seenLenses, addRemainder) {
  for (const lens of REQUIRED_REVIEW_LENSES) {
    if (!seenLenses.has(lens)) {
      addRemainder(SECTION, `${lens} review lens needs an owning task`);
    }
  }
}

function ownReviewLens({ lens, seenLenses, ...rest }) {
  const id = firstLensId(lens, seenLenses, rest.addRemainder);
  if (!id) {
    return null;
  }
  return recordOwnedLens({ id, lens, ...rest });
}

// The lens checks that need no acceptance matrix. Returns each owned lens with
// its owner task for the lens-row phase.
function validateReviewLenses({ lensList, taskList, normalizedTaskIds, evidenceOwners, addRemainder }) {
  const seenLenses = new Set();
  const lensEvidenceOwners = new Map();
  const ownedLenses = [];
  for (const lens of lensList) {
    const owned = ownReviewLens({
      lens,
      seenLenses,
      lensEvidenceOwners,
      taskList,
      normalizedTaskIds,
      evidenceOwners,
      addRemainder,
    });
    if (owned) {
      ownedLenses.push(owned);
    }
  }
  missingLensOwners(seenLenses, addRemainder);
  return ownedLenses;
}

// Runs the lens-side checks in their pinned order and returns the owned lenses
// that the acceptance phase reads.
export function lensPhase({ recordMap, lensList, taskList, normalizedTaskIds, evidenceOwners, addRemainder }) {
  validateLensOwnershipRecord({
    record: recordMap["lens-ownership"],
    reviewLenses: lensList,
    section: SECTION,
    addRemainder,
  });
  return validateReviewLenses({ lensList, taskList, normalizedTaskIds, evidenceOwners, addRemainder });
}
