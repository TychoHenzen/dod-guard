import { REQUIRED_RECORDS, REQUIRED_REVIEW_LENSES } from "./convergence-core.mjs";

// The records a structured handoff needs, every one present; the lens-ownership
// record carries the supplied lenses.
function recordValue(name, lensOwnership) {
  if (name === "lens-ownership") {
    return lensOwnership;
  }
  return true;
}

function recordsWithRequiredKeys(lensOwnership) {
  return Object.fromEntries(REQUIRED_RECORDS.map((name) => [name, recordValue(name, lensOwnership)]));
}

// The matrix row evidence a lens cites, by lens id: the two user-path lenses
// own two rows each and quality owns the last. Any other lens takes its
// index-numbered row.
function lensEvidence(id, index, prefix) {
  if (id === "wiring/usability") {
    return [`${prefix}-2`, `${prefix}-3`];
  }
  if (id === "reliability") {
    return [`${prefix}-4`, `${prefix}-5`];
  }
  if (id === "quality") {
    return `${prefix}-6`;
  }
  return `${prefix}-${index + 1}`;
}

function ownerOf(owner, id, index) {
  if (typeof owner === "function") {
    return owner(id, index);
  }
  return owner;
}

// One review lens per required lens id, each citing the rows lensEvidence
// assigns it. owner is a task id or a function of (id, index).
function reviewLenses({ owner = "task-1", headSha, prefix = "" }) {
  return REQUIRED_REVIEW_LENSES.map((id, index) => ({
    id,
    owner: ownerOf(owner, id, index),
    evidence: `lens-${id}`,
    headSha,
    acceptanceEvidence: lensEvidence(id, index, `${prefix}evidence`),
    verificationEvidence: lensEvidence(id, index, `${prefix}proof`),
  }));
}

export { recordsWithRequiredKeys, reviewLenses };
