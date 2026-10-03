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

function observationMatches(definition, observation) {
  const provider = text(observation?.provider);
  const repository = observationRepository(observation);
  const providerMatches = definition.provider === null
    || repository === definition.provider
    || provider === definition.provider;
  return observationName(observation) === definition.name && providerMatches;
}

function matchingObservations(definition, observations, expectedHeadSha) {
  const named = observations.filter((observation) => observationName(observation) === definition.name);
  const providerMatches = named.filter((observation) => observationMatches(definition, observation));
  const exact = providerMatches.filter((observation) => observationHead(observation) === expectedHeadSha);
  return { named, providerMatches, exact };
}

function contextFailure(definition, expectedHeadSha, matches) {
  if (definition.name === null) {
    return "required context name is missing";
  }
  if (expectedHeadSha === null) {
    return "exact pushed head SHA is missing";
  }
  if (matches.named.length === 0) {
    return "required context was not returned by the provider";
  }
  if (matches.providerMatches.length === 0) {
    return "required context provider does not match";
  }
  if (matches.exact.length === 0) {
    return "required context has no exact-head evidence";
  }
  return matches.exact.length > 1
    ? "required context has duplicate exact-head evidence"
    : null;
}

function baseContextRow(definition, expectedHeadSha) {
  return {
    name: definition.name,
    provider: definition.provider,
    workflow: definition.workflow,
    runId: null,
    ref: null,
    headSha: null,
    expectedHeadSha,
    state: "unavailable",
    observedState: null,
    dispatchable: definition.dispatchable,
    reason: null,
  };
}

function contextRow(definition, observations, expectedHeadSha) {
  const matches = matchingObservations(definition, observations, expectedHeadSha);
  const base = baseContextRow(definition, expectedHeadSha);
  const failure = contextFailure(definition, expectedHeadSha, matches);
  if (failure !== null) {
    return { ...base, reason: failure };
  }

  const observation = matches.exact[0];
  const rawState = firstText(observation.state, observation.conclusion, observation.status);
  const row = {
    ...base,
    provider: firstText(definition.provider, observation.provider, observationRepository(observation)),
    workflow: firstText(definition.workflow, observation.workflow),
    runId: observationRunId(observation),
    ref: observationRef(observation),
    headSha: observationHead(observation),
    state: normalizedState(rawState),
    observedState: rawState,
  };
  const missingEvidence = CONTEXT_EVIDENCE_FIELDS.filter((field) => row[field] === null);
  if (missingEvidence.length === 0) {
    return row;
  }
  return {
    ...row,
    state: "unavailable",
    reason: `required context evidence is missing: ${missingEvidence.join(", ")}`,
  };
}

export function buildRequiredContextMatrix({ requiredContexts = [], observations = [], headSha } = {}) {
  const expectedHeadSha = text(headSha);
  const definitions = requiredContexts.map(contextDefinition);
  const rows = definitions.map((definition) => contextRow(definition, observations, expectedHeadSha));
  return { headSha: expectedHeadSha, rows };
}

function matrixRows(matrix) {
  if (Array.isArray(matrix?.rows)) {
    return matrix.rows;
  }
  return Array.isArray(matrix) ? matrix : null;
}

function matrixHeaderErrors(expectedHeadSha, rows) {
  const errors = [];
  if (expectedHeadSha === null) {
    errors.push("required-context matrix needs an independently fetched current pushed head SHA");
  }
  if (rows === null || rows.length === 0) {
    errors.push("required-context matrix needs one row per required context");
  }
  return errors;
}

function rowIdentityErrors(row, name, expectedNames, expectedHeadSha, duplicate) {
  const missing = CONTEXT_EVIDENCE_FIELDS
    .filter((field) => text(row?.[field]) === null)
    .map((field) => `required context ${name} is missing ${field}`);
  return [
    ...(duplicate ? [`required context ${name} has duplicate rows`] : []),
    ...(expectedNames.length > 0 && !expectedNames.includes(name)
      ? [`unexpected required context ${name}`]
      : []),
    ...missing,
    ...(expectedHeadSha !== null && row?.headSha !== expectedHeadSha
      ? [`required context ${name} is bound to head ${row?.headSha ?? "<missing>"}, expected ${expectedHeadSha}`]
      : []),
  ];
}

function rowStateErrors(row, name) {
  return [
    ...(!CONTEXT_STATES.includes(row?.state)
      ? [`required context ${name} has unsupported state ${row?.state ?? "<missing>"}`]
      : []),
    ...(row?.state !== "present"
      ? [`required context ${name} is ${row?.state ?? "unavailable"}`]
      : []),
  ];
}

function rowErrors(row, expectedNames, expectedHeadSha, seen) {
  const name = text(row?.name);
  if (name === null) {
    return ["required-context row is missing name"];
  }
  const duplicate = seen.has(name);
  seen.add(name);
  return [
    ...rowIdentityErrors(row, name, expectedNames, expectedHeadSha, duplicate),
    ...rowStateErrors(row, name),
  ];
}

export function validateRequiredContextMatrix({ matrix, requiredContexts = [], headSha } = {}) {
  const expectedHeadSha = text(headSha);
  const rows = matrixRows(matrix);
  const headerErrors = matrixHeaderErrors(expectedHeadSha, rows);
  if (rows === null || rows.length === 0) {
    return { valid: false, errors: headerErrors, rows: [] };
  }

  const expectedNames = requiredContexts
    .map(contextDefinition)
    .map(({ name }) => name)
    .filter((name) => name !== null);
  const seen = new Set();
  const errors = rows.flatMap((row) => rowErrors(row, expectedNames, expectedHeadSha, seen));
  const missingNames = expectedNames
    .filter((name) => !seen.has(name))
    .map((name) => `required context ${name} is not enumerated`);
  return {
    valid: headerErrors.length === 0 && errors.length === 0 && missingNames.length === 0,
    errors: [...headerErrors, ...errors, ...missingNames],
    rows,
  };
}
