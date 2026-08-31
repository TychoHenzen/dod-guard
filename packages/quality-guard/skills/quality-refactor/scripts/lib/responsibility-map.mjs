/**
 * Validate discovery evidence before it becomes a quality-refactor task plan.
 * `stagedMap` deliberately has the same shape accepted by the staged commit
 * gate. The surrounding discovery record adds planning facts that do not
 * belong in that gate's compact acknowledgement target.
 */

function fail(message) {
  throw new Error(`responsibility discovery: ${message}`);
}

function record(value, location) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${location} must be an object`);
  return value;
}

function strings(value, location, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) {
    fail(`${location} must be ${allowEmpty ? "an array" : "a non-empty array"} of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function text(value, location) {
  if (typeof value !== "string" || !value.trim()) fail(`${location} must be a non-empty string`);
  return value.trim();
}

function stagedMap(value) {
  const map = record(value, "stagedMap");
  const targetScope = strings(map.targetScope, "stagedMap.targetScope");
  if (!Array.isArray(map.responsibilities) || map.responsibilities.length === 0) fail("stagedMap.responsibilities must be a non-empty array");
  const responsibilities = map.responsibilities.map((item, index) => {
    const responsibility = record(item, `stagedMap.responsibilities[${index}]`);
    return {
      name: text(responsibility.name, `stagedMap.responsibilities[${index}].name`),
      currentOwners: strings(responsibility.currentOwners, `stagedMap.responsibilities[${index}].currentOwners`),
      consumers: strings(responsibility.consumers, `stagedMap.responsibilities[${index}].consumers`, true),
      dependencies: strings(responsibility.dependencies, `stagedMap.responsibilities[${index}].dependencies`, true),
    };
  });
  const desired = record(map.desired, "stagedMap.desired");
  if (!Array.isArray(desired.ownership) || !Array.isArray(desired.boundaries)) fail("stagedMap.desired requires ownership and boundaries arrays");
  if (desired.ownership.length + desired.boundaries.length === 0) fail("stagedMap.desired needs an outcome");
  return { targetScope, responsibilities, desired };
}

/** Validate the discovery record used before quality-refactor writes tasks. */
export function validateResponsibilityDiscovery(value) {
  const discovery = record(value, "discovery");
  const map = stagedMap(discovery.stagedMap);
  if (!Array.isArray(discovery.structuralOutcomes) || discovery.structuralOutcomes.length === 0) fail("structuralOutcomes must be a non-empty array");
  const responsibilityNames = new Set(map.responsibilities.map((item) => item.name));
  const structuralOutcomes = discovery.structuralOutcomes.map((item, index) => {
    const outcome = record(item, `structuralOutcomes[${index}]`);
    const responsibility = text(outcome.responsibility, `structuralOutcomes[${index}].responsibility`);
    if (!responsibilityNames.has(responsibility)) fail(`structuralOutcomes[${index}] names an unknown responsibility`);
    return {
      responsibility,
      desiredOwner: text(outcome.desiredOwner, `structuralOutcomes[${index}].desiredOwner`),
      directory: text(outcome.directory, `structuralOutcomes[${index}].directory`),
      publicBoundary: text(outcome.publicBoundary, `structuralOutcomes[${index}].publicBoundary`),
      dependencyDirection: text(outcome.dependencyDirection, `structuralOutcomes[${index}].dependencyDirection`),
      stableContracts: strings(outcome.stableContracts, `structuralOutcomes[${index}].stableContracts`, true),
      compatibilityRemovals: strings(outcome.compatibilityRemovals, `structuralOutcomes[${index}].compatibilityRemovals`, true),
      evidence: record(outcome.evidence, `structuralOutcomes[${index}].evidence`),
    };
  });
  return { stagedMap: map, structuralOutcomes };
}
