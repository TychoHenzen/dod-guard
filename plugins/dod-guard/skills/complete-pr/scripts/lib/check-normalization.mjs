const PASSING_CHECK_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const PENDING_CHECK_STATUSES = new Set(["EXPECTED", "QUEUED", "IN_PROGRESS", "PENDING", "REQUESTED", "WAITING"]);
const FAILED_CHECK_CONCLUSIONS = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "FAILURE",
  "STALE",
  "STARTUP_FAILURE",
  "TIMED_OUT",
]);
const PASSING_STATUS_STATES = new Set(["SUCCESS"]);
const PENDING_STATUS_STATES = new Set(["EXPECTED", "PENDING"]);
const FAILED_STATUS_STATES = new Set(["ERROR", "FAILURE"]);

function normalizeState(value) {
  return value?.toUpperCase() ?? null;
}

function normalizeCheckRun(run, headSha) {
  let state = normalizeState(run.conclusion ?? run.status);
  let bucket = "unknown";

  if (run.head_sha !== headSha) {
    state = "STALE_HEAD";
  } else if (normalizeState(run.status) !== "COMPLETED") {
    if (PENDING_CHECK_STATUSES.has(normalizeState(run.status))) {
      bucket = "pending";
    }
  } else if (PASSING_CHECK_CONCLUSIONS.has(state)) {
    bucket = "pass";
  } else if (FAILED_CHECK_CONCLUSIONS.has(state)) {
    bucket = "fail";
  }

  return { bucket, name: run.name, state };
}

function normalizeCommitStatus(status, headSha) {
  const state = normalizeState(status.state);
  let bucket = "unknown";

  if (status.sha !== headSha) {
    return { bucket, name: status.context, state: "STALE_HEAD" };
  }
  if (PASSING_STATUS_STATES.has(state)) {
    bucket = "pass";
  } else if (PENDING_STATUS_STATES.has(state)) {
    bucket = "pending";
  } else if (FAILED_STATUS_STATES.has(state)) {
    bucket = "fail";
  }

  return { bucket, name: status.context, state };
}

function requiredCheckDefinitions(protection) {
  if (Array.isArray(protection.checks) && protection.checks.length > 0) {
    return protection.checks.map((check) => ({ name: check.context, appId: check.app_id ?? null }));
  }
  return (protection.contexts ?? []).map((name) => ({ name, appId: null }));
}

function duplicateResult(name) {
  return { bucket: "unknown", name, state: "DUPLICATE" };
}

function staleResult(name) {
  return { bucket: "unknown", name, state: "STALE_HEAD" };
}

// Orders repeated runs of one check by numeric check-run id. A set with a missing or repeated id
// cannot be ordered, so it yields null.
function newestRun(runs) {
  const ids = runs.map((run) => run.id);
  if (!ids.every((id) => Number.isSafeInteger(id)) || new Set(ids).size !== ids.length) {
    return null;
  }
  return runs.reduce((newest, run) => (run.id > newest.id ? run : newest));
}

function sameVerdict(runs, headSha) {
  const [first, ...rest] = runs.map((run) => normalizeCheckRun(run, headSha));
  return rest.every((result) => result.bucket === first.bucket && result.state === first.state);
}

// A check can run more than once on one head, for example from a pull_request event and a
// workflow_dispatch event. The newest run decides, so an older pass never hides a newer failure
// or a run that is still in progress. Runs that cannot be ordered count only when they agree.
function settleRepeatedRuns(name, runs, headSha) {
  if (runs.length < 2) {
    return { runs };
  }
  const newest = newestRun(runs);
  if (newest) {
    return { runs: [newest] };
  }
  if (sameVerdict(runs, headSha)) {
    return { runs: [runs[0]] };
  }
  return { result: duplicateResult(name) };
}

// ASSUMPTION: a run without an app id cannot be shown to share a provider with another run, so
// repeated runs under a requirement with no expected app collapse only when every run names one app.
function oneProvider(runs) {
  const appIds = runs.map((run) => run.app?.id);
  return appIds.every((id) => id !== undefined && id !== null) && new Set(appIds.map(String)).size === 1;
}

function providerConflictResult(name) {
  return { bucket: "unknown", name, state: "PROVIDER_CONFLICT" };
}

function providerRuns(definition, namedRuns, exactRuns, headSha) {
  if (definition.appId === null || definition.appId === -1) {
    if (exactRuns.length === 0 && namedRuns.length > 0) {
      return { result: staleResult(definition.name) };
    }
    if (exactRuns.length > 1 && !oneProvider(exactRuns)) {
      return { result: providerConflictResult(definition.name) };
    }
    return settleRepeatedRuns(definition.name, exactRuns, headSha);
  }

  const matches = exactRuns.filter((run) => String(run.app?.id) === String(definition.appId));
  if (matches.length > 0 && exactRuns.length > matches.length) {
    return { result: providerConflictResult(definition.name) };
  }
  if (matches.length === 0) {
    if (exactRuns.length > 0) {
      return { result: { bucket: "unknown", name: definition.name, state: "PROVIDER_MISMATCH" } };
    }
    if (namedRuns.length > 0) {
      return { result: staleResult(definition.name) };
    }
    return { result: { bucket: "unknown", name: definition.name, state: "MISSING" } };
  }
  return settleRepeatedRuns(definition.name, matches, headSha);
}

function statusResults(name, namedStatuses, exactStatuses) {
  if (exactStatuses.length > 1) {
    return { result: duplicateResult(name) };
  }
  if (exactStatuses.length === 0 && namedStatuses.length > 0) {
    return { result: staleResult(name) };
  }
  return { statuses: exactStatuses };
}

function summarizeResults(name, results) {
  if (results.length === 0) {
    return { bucket: "unknown", name, state: "MISSING" };
  }
  const unknown = results.find((result) => result.bucket === "unknown");
  if (unknown) {
    return { bucket: "unknown", name, state: unknown.state };
  }
  const failed = results.find((result) => result.bucket === "fail");
  if (failed) {
    return { bucket: "fail", name, state: failed.state };
  }
  const pending = results.find((result) => result.bucket === "pending");
  if (pending) {
    return { bucket: "pending", name, state: pending.state };
  }
  return { bucket: "pass", name, state: results[0].state };
}

function fallbackCheck(definition, checkRuns, statuses, headSha) {
  const namedRuns = checkRuns.filter((run) => run.name === definition.name);
  const exactRuns = namedRuns.filter((run) => run.head_sha === headSha);
  const namedStatuses = statuses.filter((status) => status.context === definition.name);
  const exactStatuses = namedStatuses.filter((status) => status.sha === headSha);
  const runResult = providerRuns(definition, namedRuns, exactRuns, headSha);
  if (runResult.result) {
    return runResult.result;
  }
  const statusResult = statusResults(definition.name, namedStatuses, exactStatuses);
  if (statusResult.result) {
    return statusResult.result;
  }
  if (runResult.runs.length > 0 && statusResult.statuses.length > 0) {
    return { bucket: "unknown", name: definition.name, state: "DUPLICATE" };
  }
  const results = [
    ...runResult.runs.map((run) => normalizeCheckRun(run, headSha)),
    ...statusResult.statuses.map((status) => normalizeCommitStatus(status, headSha)),
  ];
  return summarizeResults(definition.name, results);
}

function normalizeRequiredChecks(protection, checkRuns, statuses, headSha) {
  return requiredCheckDefinitions(protection).map((definition) => fallbackCheck(definition, checkRuns, statuses, headSha));
}

export { normalizeCheckRun, normalizeRequiredChecks };
