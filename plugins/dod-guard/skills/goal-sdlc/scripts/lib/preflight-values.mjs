const NORMALIZED_STATES = new Map([
  ["success", "present"],
  ["passed", "present"],
  ["pass", "present"],
  ["neutral", "present"],
  ["expected", "pending"],
  ["queued", "pending"],
  ["in_progress", "pending"],
  ["pending", "pending"],
  ["requested", "pending"],
  ["waiting", "pending"],
  ["action_required", "failed"],
  ["cancelled", "failed"],
  ["failure", "failed"],
  ["failed", "failed"],
  ["startup_failure", "failed"],
  ["timed_out", "failed"],
  ["skipped", "skipped"],
]);

export const CONTEXT_STATES = [
  "present",
  "pending",
  "failed",
  "skipped",
  "unavailable",
];

export const CONTEXT_EVIDENCE_FIELDS = [
  "provider",
  "workflow",
  "runId",
  "ref",
  "headSha",
];

export function text(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

export function firstText(...values) {
  for (const value of values) {
    const result = text(value);
    if (result !== null) {
      return result;
    }
  }
  return null;
}

export function normalizedState(value) {
  const state = text(value)?.toLowerCase() ?? "";
  return NORMALIZED_STATES.get(state) ?? "unavailable";
}

export function observationName(observation) {
  return firstText(observation?.name, observation?.context);
}

export function observationHead(observation) {
  return firstText(observation?.headSha, observation?.head_sha, observation?.sha);
}

export function observationRef(observation) {
  return firstText(observation?.ref, observation?.branchRef, observation?.targetRef);
}

export function observationRunId(observation) {
  return firstText(observation?.runId, observation?.run_id, observation?.id);
}

export function observationRepository(observation) {
  return firstText(observation?.repository, observation?.headRepository);
}

export function observationWorkflow(observation) {
  return firstText(observation?.workflow, observation?.workflowName);
}

export function observationType(observation) {
  return firstText(observation?.type, observation?.kind, observation?.source)?.toLowerCase() ?? null;
}

export function isStatusObservation(observation) {
  if (observation?.statusOnly === true) {
    return true;
  }
  if (["status", "commit-status", "commit_status"].includes(observationType(observation))) {
    return true;
  }
  return observation?.name === undefined
    && observation?.context !== undefined
    && observationWorkflow(observation) === null;
}
