import {
  CONTEXT_EVIDENCE_FIELDS,
  CONTEXT_STATES,
  firstText,
  normalizedState,
  observationHead,
  observationName,
  observationRef,
  observationRepository,
  observationRunId,
  observationWorkflow,
  isStatusObservation,
  text,
} from "./preflight-values.mjs";

function contextDefinition(definition) {
  if (typeof definition === "string") {
    return {
      name: text(definition),
      provider: null,
      workflow: null,
      dispatchable: true,
    };
  }
  return {
    name: text(definition?.name),
    provider: firstText(definition?.provider),
    workflow: firstText(definition?.workflow),
    dispatchable: definition?.dispatchable !== false,
  };
}

function matchingObservations(definition, observations, expectedIdentity) {
  const named = observations.filter((observation) => observationName(observation) === definition.name);
  const providerMatches = named.filter((observation) => {
    const provider = text(observation?.provider);
    return definition.provider === null
      || provider === definition.provider
      || (isStatusObservation(observation) && provider === null);
  });
  const workflowMatches = providerMatches.filter((observation) => {
    const workflow = observationWorkflow(observation);
    return definition.workflow === null
      || workflow === null
      || workflow === definition.workflow;
  });
  const repositoryMatches = workflowMatches.filter((observation) => {
    return observationRepository(observation) === expectedIdentity.repository
      || (isStatusObservation(observation) && observationRepository(observation) === null);
  });
  const refMatches = repositoryMatches.filter((observation) => {
    return observationRef(observation) === expectedIdentity.ref
      || (isStatusObservation(observation) && observationRef(observation) === null);
  });
  const exact = refMatches.filter((observation) => observationHead(observation) === expectedIdentity.headSha);
  return { named, providerMatches, workflowMatches, repositoryMatches, refMatches, exact };
}

function contextFailure(definition, expectedIdentity, matches) {
  if (definition.name === null) {
    return "required context name is missing";
  }
  if (expectedIdentity.repository === null || expectedIdentity.ref === null) {
    return "pull request repository and branch ref are required";
  }
  if (expectedIdentity.headSha === null) {
    return "exact pushed head SHA is missing";
  }
  if (matches.named.length === 0) {
    return "required context was not returned by the provider";
  }
  if (matches.providerMatches.length === 0) {
    return "required context provider does not match";
  }
  if (matches.workflowMatches.length === 0) {
    return "required context workflow does not match";
  }
  if (matches.repositoryMatches.length === 0) {
    return "required context repository does not match";
  }
  if (matches.refMatches.length === 0) {
    return "required context ref does not match";
  }
  if (matches.exact.length === 0) {
    return "required context has no exact-head evidence";
  }
  return matches.exact.length > 1
    ? "required context has duplicate exact-head evidence"
    : null;
}

function baseContextRow(definition, expectedIdentity) {
  return {
    name: definition.name,
    provider: definition.provider,
    workflow: definition.workflow,
    runId: null,
    repository: null,
    ref: null,
    headSha: null,
    expectedHeadSha: expectedIdentity.headSha,
    state: "unavailable",
    observedState: null,
    dispatchable: definition.dispatchable,
    source: null,
    reason: null,
  };
}

function contextRow(definition, observations, expectedIdentity) {
  const matches = matchingObservations(definition, observations, expectedIdentity);
  const base = baseContextRow(definition, expectedIdentity);
  const failure = contextFailure(definition, expectedIdentity, matches);
  if (failure !== null) {
    return { ...base, reason: failure };
  }

  const observation = matches.exact[0];
  const statusOnly = isStatusObservation(observation);
  const rawState = firstText(observation.state, observation.conclusion, observation.status);
  const row = {
    ...base,
    provider: firstText(observation.provider, statusOnly ? definition.provider : null),
    workflow: observationWorkflow(observation),
    runId: observationRunId(observation),
    repository: firstText(
      observationRepository(observation),
      statusOnly ? expectedIdentity.repository : null,
    ),
    ref: firstText(observationRef(observation), statusOnly ? expectedIdentity.ref : null),
    headSha: observationHead(observation),
    state: normalizedState(rawState),
    observedState: rawState,
    source: statusOnly ? "status" : "check-run",
  };
  const requiredFields = statusOnly
    ? ["provider", "repository", "ref", "headSha"]
    : [...CONTEXT_EVIDENCE_FIELDS, "repository"];
  const missingEvidence = requiredFields.filter((field) => row[field] === null);
  if (missingEvidence.length === 0) {
    return row;
  }
  return {
    ...row,
    state: "unavailable",
    reason: `required context evidence is missing: ${missingEvidence.join(", ")}`,
  };
}

export function buildRequiredContextMatrix({
  requiredContexts = [],
  observations = [],
  repository,
  ref,
  headSha,
} = {}) {
  const expectedIdentity = {
    repository: text(repository),
    ref: text(ref),
    headSha: text(headSha),
  };
  const definitions = requiredContexts.map(contextDefinition);
  const rows = definitions.map((definition) => contextRow(definition, observations, expectedIdentity));
  return {
    repository: expectedIdentity.repository,
    ref: expectedIdentity.ref,
    headSha: expectedIdentity.headSha,
    rows,
  };
}

function matrixRows(matrix) {
  if (Array.isArray(matrix?.rows)) {
    return matrix.rows;
  }
  return Array.isArray(matrix) ? matrix : null;
}

function matrixHeaderErrors(expectedIdentity, matrix, rows) {
  const errors = [];
  if (expectedIdentity.repository === null) {
    errors.push("required-context matrix needs an independently fetched pull request repository");
  }
  if (expectedIdentity.ref === null) {
    errors.push("required-context matrix needs an independently fetched pull request branch ref");
  }
  if (expectedIdentity.headSha === null) {
    errors.push("required-context matrix needs an independently fetched current pushed head SHA");
  }
  if (rows === null || rows.length === 0) {
    errors.push("required-context matrix needs one row per required context");
  }
  if (matrix?.repository !== undefined && text(matrix.repository) !== expectedIdentity.repository) {
    errors.push("required-context matrix repository does not match the independently fetched repository");
  }
  if (matrix?.ref !== undefined && text(matrix.ref) !== expectedIdentity.ref) {
    errors.push("required-context matrix ref does not match the independently fetched branch ref");
  }
  if (matrix?.headSha !== undefined && text(matrix.headSha) !== expectedIdentity.headSha) {
    errors.push("required-context matrix head does not match the independently fetched pushed head SHA");
  }
  return errors;
}

function rowIdentityErrors(row, name, expectedNames, expectedIdentity, duplicate) {
  const source = row?.source ?? "check-run";
  const fields = source === "status"
    ? ["provider", "repository", "ref", "headSha"]
    : [...CONTEXT_EVIDENCE_FIELDS, "repository"];
  const missing = fields
    .filter((field) => text(row?.[field]) === null)
    .map((field) => `required context ${name} is missing ${field}`);
  return [
    ...(duplicate ? [`required context ${name} has duplicate rows`] : []),
    ...(expectedNames.length > 0 && !expectedNames.includes(name)
      ? [`unexpected required context ${name}`]
      : []),
    ...missing,
    ...(expectedIdentity.repository !== null && row?.repository !== expectedIdentity.repository
      ? [`required context ${name} is bound to repository ${row?.repository ?? "<missing>"}, expected ${expectedIdentity.repository}`]
      : []),
    ...(expectedIdentity.ref !== null && row?.ref !== expectedIdentity.ref
      ? [`required context ${name} is bound to ref ${row?.ref ?? "<missing>"}, expected ${expectedIdentity.ref}`]
      : []),
    ...(expectedIdentity.headSha !== null && row?.headSha !== expectedIdentity.headSha
      ? [`required context ${name} is bound to head ${row?.headSha ?? "<missing>"}, expected ${expectedIdentity.headSha}`]
      : []),
  ];
}

function rowStateErrors(row, name) {
  return [
    ...(!CONTEXT_STATES.includes(row?.state)
      ? [`required context ${name} has unsupported state ${row?.state ?? "<missing>"}`]
      : []),
    ...(!["present", "skipped"].includes(row?.state)
      ? [`required context ${name} is ${row?.state ?? "unavailable"}`]
      : []),
  ];
}

function rowErrors(row, expectedNames, expectedIdentity, seen) {
  const name = text(row?.name);
  if (name === null) {
    return ["required-context row is missing name"];
  }
  const duplicate = seen.has(name);
  seen.add(name);
  return [
    ...rowIdentityErrors(row, name, expectedNames, expectedIdentity, duplicate),
    ...rowStateErrors(row, name),
  ];
}

export function validateRequiredContextMatrix({
  matrix,
  requiredContexts = [],
  repository,
  ref,
  headSha,
} = {}) {
  const expectedIdentity = { repository: text(repository), ref: text(ref), headSha: text(headSha) };
  const rows = matrixRows(matrix);
  const headerErrors = matrixHeaderErrors(expectedIdentity, matrix, rows);
  if (rows === null || rows.length === 0) {
    return { valid: false, errors: headerErrors, rows: [] };
  }

  const expectedNames = requiredContexts
    .map(contextDefinition)
    .map(({ name }) => name)
    .filter((name) => name !== null);
  const seen = new Set();
  const errors = rows.flatMap((row) => rowErrors(row, expectedNames, expectedIdentity, seen));
  const missingNames = expectedNames
    .filter((name) => !seen.has(name))
    .map((name) => `required context ${name} is not enumerated`);
  return {
    valid: headerErrors.length === 0 && errors.length === 0 && missingNames.length === 0,
    errors: [...headerErrors, ...errors, ...missingNames],
    rows,
  };
}
