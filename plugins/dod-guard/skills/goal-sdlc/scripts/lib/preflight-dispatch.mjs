import {
  firstText,
  normalizedState,
  observationHead,
  observationRef,
  observationRepository,
  observationRunId,
  text,
} from "./preflight-values.mjs";

function pullRequestRepository(pullRequest) {
  return firstText(pullRequest?.repository, pullRequest?.headRepository);
}

function pullRequestRef(pullRequest) {
  return firstText(pullRequest?.headRef, pullRequest?.ref, pullRequest?.head?.ref);
}

function pullRequestHead(pullRequest) {
  return firstText(pullRequest?.headSha, pullRequest?.head?.sha);
}

function dispatchKey({ repository, ref, headSha, workflow }) {
  return `${repository}:${ref}@${headSha}:${workflow}`;
}

function noSkippedPlan(notReady) {
  if (notReady.length === 0) {
    return { kind: "none", reason: "all required contexts are present" };
  }
  return {
    kind: "stop",
    code: "required_contexts_not_ready",
    reasons: notReady.map(({ name, state }) => `${name}=${state}`),
  };
}

function pullRequestIdentity(pullRequest) {
  return {
    state: pullRequest?.state,
    repository: pullRequestRepository(pullRequest),
    ref: pullRequestRef(pullRequest),
    headSha: pullRequestHead(pullRequest),
  };
}

function identityFailure(identity) {
  const complete = identity.state === "OPEN"
    && identity.repository !== null
    && identity.ref !== null
    && identity.headSha !== null;
  return complete ? null : "open same-repository branch ref and exact head are required";
}

function readinessFailure(readiness, identity) {
  const matches = readiness?.read === true
    && readiness.isDraft === true
    && readiness.headSha === identity.headSha
    && readiness.ref === identity.ref
    && readiness.repository === identity.repository;
  return matches ? null : "draft readiness must be read back at the exact same repository ref and head";
}

function skippedWorkflow(skipped) {
  const workflow = skipped.find((row) => row.workflow !== null)?.workflow ?? null;
  if (workflow === null || skipped.some((row) => row.workflow === null)) {
    return {
      error: "each skipped context needs one dispatchable workflow identity",
      code: "workflow_identity_unavailable",
    };
  }
  if (skipped.some((row) => row.dispatchable !== true)) {
    return {
      error: "a skipped required workflow has no supported dispatch path",
      code: "workflow_dispatch_unavailable",
    };
  }
  return { workflow };
}

export function planDraftWorkflowDispatch({
  matrix,
  pullRequest,
  readiness,
  dispatchedRefs = [],
} = {}) {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const skipped = rows.filter((row) => row.state === "skipped");
  const notReady = rows.filter((row) => row.state !== "present");
  if (skipped.length === 0) {
    return noSkippedPlan(notReady);
  }
  const blocked = rows.filter(
    (row) => row.state !== "present" && row.state !== "skipped",
  );
  if (blocked.length > 0) {
    return noSkippedPlan(blocked);
  }

  const identity = pullRequestIdentity(pullRequest);
  const identityReason = identityFailure(identity);
  if (identityReason !== null) {
    return {
      kind: "stop",
      code: "pull_request_identity_unavailable",
      reasons: [identityReason],
    };
  }
  const readinessReason = readinessFailure(readiness, identity);
  if (readinessReason !== null) {
    return { kind: "stop", code: "readiness_readback_missing", reasons: [readinessReason] };
  }
  const selection = skippedWorkflow(skipped);
  if (selection.error) {
    return { kind: "stop", code: selection.code, reasons: [selection.error] };
  }
  const key = dispatchKey({ ...identity, workflow: selection.workflow });
  if (dispatchedRefs.includes(key)) {
    return {
      kind: "stop",
      code: "duplicate_workflow_dispatch",
      reasons: [
        `workflow ${selection.workflow} was already dispatched for `
        + `${identity.repository}:${identity.ref}@${identity.headSha}`,
      ],
    };
  }
  return {
    kind: "dispatch",
    workflow: selection.workflow,
    repository: identity.repository,
    ref: identity.ref,
    headSha: identity.headSha,
    dispatchKey: key,
    invalidatesAcceptance: true,
  };
}

function dispatchEvidence(run) {
  return {
    workflow: firstText(run.workflow, run.workflowName),
    runId: observationRunId(run),
    repository: observationRepository(run),
    ref: observationRef(run),
    headSha: observationHead(run),
    state: normalizedState(run.state ?? run.conclusion ?? run.status),
  };
}

function normalizeRunIds(value) {
  if (!Array.isArray(value)) {
    return null;
  }
  return new Set(value.map((run) => observationRunId(run) ?? text(run)).filter((runId) => runId !== null));
}

function runCreatedAt(run) {
  return firstText(run.createdAt, run.created_at);
}

function dispatchCorrelationErrors(plan, run, { preDispatchRunIds, dispatchStartedAt } = {}) {
  const priorRunIds = preDispatchRunIds === undefined
    ? normalizeRunIds(plan?.preDispatchRunIds)
    : normalizeRunIds(preDispatchRunIds);
  const startedAt = firstText(dispatchStartedAt, plan?.dispatchStartedAt);
  if (priorRunIds === null && startedAt === null) {
    return ["workflow dispatch readback needs pre-dispatch run IDs or dispatch timestamp"];
  }

  const errors = [];
  const runId = observationRunId(run);
  if (priorRunIds?.has(runId)) {
    errors.push("workflow dispatch readback matched a run that existed before dispatch");
  }
  if (startedAt !== null) {
    const createdAt = runCreatedAt(run);
    const startedTime = Date.parse(startedAt);
    const createdTime = createdAt === null ? Number.NaN : Date.parse(createdAt);
    if (!Number.isFinite(startedTime) || !Number.isFinite(createdTime)) {
      errors.push("workflow dispatch readback needs valid dispatch and run timestamps");
    } else if (createdTime <= startedTime) {
      errors.push("workflow dispatch readback matched a run created before dispatch");
    }
  }
  return errors;
}

function readbackErrors(plan, run, evidence, correlation) {
  const missing = ["workflow", "runId", "repository", "ref", "headSha"]
    .filter((field) => evidence[field] === null)
    .map((field) => `workflow dispatch evidence is missing ${field}`);
  if (plan?.kind !== "dispatch") {
    return missing;
  }
  const changed = ["workflow", "repository", "ref", "headSha"]
    .filter((field) => evidence[field] !== plan[field])
    .map((field) => `workflow dispatch ${field} changed during readback`);
  const stateError = ["present", "pending"].includes(evidence.state)
    ? []
    : [`workflow dispatch readback is ${evidence.state}`];
  return [...missing, ...changed, ...stateError, ...dispatchCorrelationErrors(plan, run, correlation)];
}

export function validateWorkflowDispatchReadback({
  plan,
  run,
  preDispatchRunIds,
  dispatchStartedAt,
} = {}) {
  const planErrors = plan?.kind === "dispatch"
    ? []
    : ["workflow dispatch plan is missing"];
  if (!run || typeof run !== "object") {
    return {
      valid: false,
      errors: [...planErrors, "workflow dispatch readback is missing"],
      evidence: null,
    };
  }
  const evidence = dispatchEvidence(run);
  const errors = readbackErrors(plan, run, evidence, { preDispatchRunIds, dispatchStartedAt });
  return {
    valid: planErrors.length === 0 && errors.length === 0,
    errors: [...planErrors, ...errors],
    evidence,
  };
}
