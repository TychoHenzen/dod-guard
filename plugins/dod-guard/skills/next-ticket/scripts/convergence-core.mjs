const REQUIRED_RECORDS = ["requirements", "clarifications", "implementation-plan", "task-list", "lens-ownership"];

const REQUIRED_REVIEW_LENSES = ["implementation", "wiring/usability", "quality", "reliability"];

const SECTION_NAMES = [
  "Requirements and clarifications",
  "Plan and tasks",
  "Functional decomposition",
  "Acceptance and verification",
];

// Each remainder message lands in its section and in the flat remainder, in
// the order it was added. `add` is a closure, so callers may pass it bare.
function createLedger() {
  const sections = Object.fromEntries(SECTION_NAMES.map((name) => [name, []]));
  const remainder = [];
  const add = (section, message) => {
    sections[section].push(message);
    remainder.push(message);
  };
  return { sections, remainder, add };
}

function evidenceText(current) {
  if (typeof current !== "string") {
    return "";
  }
  return current.trim();
}

function expandEvidence(current, pending, visited) {
  if (!Array.isArray(current) || visited.has(current)) {
    return;
  }
  visited.add(current);
  pending.push(...current);
}

function evidenceValues(value) {
  const result = [];
  const pending = [value];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    const evidence = evidenceText(current);
    if (evidence) {
      result.push(evidence);
    }
    expandEvidence(current, pending, visited);
  }
  return result.reverse();
}

function normalizedIdentifier(value) {
  if (typeof value !== "string") {
    return null;
  }
  const identifier = value.trim();
  if (identifier) {
    return identifier;
  }
  return null;
}

function normalizeEntries({ value, label, section, addRemainder }) {
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

function claimEvidence({ owner, evidence, section, evidenceOwners, addRemainder }) {
  if (!evidenceOwners.has(evidence)) {
    evidenceOwners.set(evidence, owner);
    return;
  }
  const previousOwner = evidenceOwners.get(evidence);
  addRemainder(section, `evidence ${evidence} is mapped more than once (${previousOwner}, ${owner})`);
}

function declareEvidence({ owner, value, section, evidenceOwners, addRemainder }) {
  for (const evidence of evidenceValues(value)) {
    claimEvidence({ owner, evidence, section, evidenceOwners, addRemainder });
  }
}

function referenceProblem({ owner, evidence, referencedEvidence, evidenceOwners }) {
  if (referencedEvidence.has(evidence)) {
    return `${owner} references evidence ${evidence} more than once`;
  }
  if (!evidenceOwners.has(evidence)) {
    return `${owner} references undeclared evidence ${evidence}`;
  }
  const declaredOwner = evidenceOwners.get(evidence);
  if (declaredOwner !== owner) {
    return `${owner} references evidence owned by ${declaredOwner}`;
  }
  return null;
}

function referenceEvidence({ owner, value, section, evidenceOwners, addRemainder }) {
  const referencedEvidence = new Set();
  for (const evidence of evidenceValues(value)) {
    const problem = referenceProblem({ owner, evidence, referencedEvidence, evidenceOwners });
    if (problem) {
      addRemainder(section, problem);
    }
    referencedEvidence.add(evidence);
  }
}

export {
  createLedger,
  declareEvidence,
  evidenceValues,
  normalizedIdentifier,
  normalizeEntries,
  REQUIRED_RECORDS,
  REQUIRED_REVIEW_LENSES,
  referenceEvidence,
  SECTION_NAMES,
};
