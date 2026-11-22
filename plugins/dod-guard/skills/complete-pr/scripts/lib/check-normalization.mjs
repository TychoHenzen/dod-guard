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

function checkRunBucket(run, state) {
  const status = normalizeState(run.status);
  if (status !== "COMPLETED") {
    return PENDING_CHECK_STATUSES.has(status) ? "pending" : "unknown";
  }
  if (PASSING_CHECK_CONCLUSIONS.has(state)) {
    return "pass";
  }
  return FAILED_CHECK_CONCLUSIONS.has(state) ? "fail" : "unknown";
}

function normalizeCheckRun(run, headSha) {
  if (run.head_sha !== headSha) {
    return staleResult(run.name);
  }
  const state = normalizeState(run.conclusion ?? run.status);
  return { bucket: checkRunBucket(run, state), name: run.name, state };
}

function commitStatusBucket(state) {
  if (PASSING_STATUS_STATES.has(state)) {
    return "pass";
  }
  if (PENDING_STATUS_STATES.has(state)) {
    return "pending";
  }
  return FAILED_STATUS_STATES.has(state) ? "fail" : "unknown";
}

function normalizeCommitStatus(status, headSha) {
  if (status.sha !== headSha) {
    return staleResult(status.context);
  }
  const state = normalizeState(status.state);
  return { bucket: commitStatusBucket(state), name: status.context, state };
}

function requiredCheckDefinition(check) {
  return { name: check.context, appId: check.app_id ?? null };
}

function requiredCheckDefinitions({ checks, contexts }) {
  if (Array.isArray(checks) && checks.length > 0) {
    return checks.map(requiredCheckDefinition);
  }
  return (contexts ?? []).map((name) => ({ name, appId: null }));
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

// A requirement that names no app, or the any-app id -1, accepts a run from any one provider.
function acceptsAnyProvider(definition) {
  return definition.appId === null || definition.appId === -1;
}

// runs is { named, exact, headSha }: the check runs carrying the requirement's name, the subset on
// the head being judged, and that head.
function anyProviderRuns(name, { named, exact, headSha }) {
  if (exact.length === 0 && named.length > 0) {
    return { result: staleResult(name) };
  }
  if (exact.length > 1 && !oneProvider(exact)) {
    return { result: providerConflictResult(name) };
  }
  return settleRepeatedRuns(name, exact, headSha);
}

function unmatchedProviderResult(name, { named, exact }) {
  if (exact.length > 0) {
    return { bucket: "unknown", name, state: "PROVIDER_MISMATCH" };
  }
  return named.length > 0 ? staleResult(name) : { bucket: "unknown", name, state: "MISSING" };
}

function expectedProviderRuns(definition, runs) {
  const matches = runs.exact.filter((run) => String(run.app?.id) === String(definition.appId));
  if (matches.length > 0 && runs.exact.length > matches.length) {
    return { result: providerConflictResult(definition.name) };
  }
  if (matches.length === 0) {
    return { result: unmatchedProviderResult(definition.name, runs) };
  }
  return settleRepeatedRuns(definition.name, matches, runs.headSha);
}

function providerRuns(definition, runs) {
  return acceptsAnyProvider(definition)
    ? anyProviderRuns(definition.name, runs)
    : expectedProviderRuns(definition, runs);
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

// evidence is { checkRuns, statuses, headSha }: everything read for the one head being judged.
function requiredCheckResult(definition, { checkRuns, statuses, headSha }) {
  const named = checkRuns.filter((run) => run.name === definition.name);
  const exact = named.filter((run) => run.head_sha === headSha);
  const namedStatuses = statuses.filter((status) => status.context === definition.name);
  const exactStatuses = namedStatuses.filter((status) => status.sha === headSha);
  const runResult = providerRuns(definition, { named, exact, headSha });
  if (runResult.result) {
    return runResult.result;
  }
  const statusResult = statusResults(definition.name, namedStatuses, exactStatuses);
  if (statusResult.result) {
    return statusResult.result;
  }
  if (runResult.runs.length > 0 && statusResult.statuses.length > 0) {
    return duplicateResult(definition.name);
  }
  const results = [
    ...runResult.runs.map((run) => normalizeCheckRun(run, headSha)),
    ...statusResult.statuses.map((status) => normalizeCommitStatus(status, headSha)),
  ];
  return summarizeResults(definition.name, results);
}

function normalizeRequiredChecks(protection, evidence) {
  return requiredCheckDefinitions(protection).map((definition) => requiredCheckResult(definition, evidence));
}

export { normalizeCheckRun, normalizeRequiredChecks };
