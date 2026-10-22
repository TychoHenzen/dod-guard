// Reads, and when it is missing dispatches, the exact-head ci.yml run that must pass before the merge.
import { normalizeCheckRun } from "./check-normalization.mjs";
import { CompletionError, stop } from "./completion-error.mjs";

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";

function createCiRecovery(options) {
  return {
    dispatchedHeads: new Set(),
    pollLimit: options.ciRunPollLimit,
    pollMs: options.pollMs,
  };
}

function requireCiWorkflowRun(runs, headSha) {
  if (!Array.isArray(runs)) {
    stop("unknown_ci_workflow_state", `GitHub returned an invalid run list for ${headSha}.`);
  }
  if (runs.length === 0) {
    return null;
  }

  const runsByEvent = new Map();
  for (const run of runs) {
    const hasEvent = run && typeof run === "object" && typeof run.event === "string" && run.event.length > 0;
    if (!hasEvent) {
      stop("unknown_ci_workflow_state", `GitHub returned an invalid ci.yml run event for ${headSha}.`);
    }
    if (runsByEvent.has(run.event)) {
      stop(
        "duplicate_ci_workflow_run",
        `Found multiple ci.yml runs for ${headSha} and event ${run.event}.`,
        `Do not dispatch again. Rerun only the failed jobs of the existing run with: gh run rerun <run-id> --failed (list runs with: gh run list --workflow ci.yml --commit ${headSha}). Then rerun complete-pr.`,
      );
    }
    runsByEvent.set(run.event, requireExactCiWorkflowRun(run, headSha));
  }

  return [...runsByEvent.values()];
}

function requireExactCiWorkflowRun(run, headSha) {
  if (!run || typeof run !== "object") {
    stop("unknown_ci_workflow_state", `GitHub returned an invalid ci.yml run for ${headSha}.`);
  }
  requireMatchingCiHead(run, headSha);
  requireCiWorkflowPath(run);

  return run;
}

function requireMatchingCiHead(run, headSha) {
  if (run.head_sha !== headSha) {
    const reportedHead = run.head_sha ?? "<missing>";
    stop("stale_ci_workflow_run", `The ci.yml run reports ${reportedHead}, not trusted head ${headSha}.`);
  }
}

function requireCiWorkflowPath(run) {
  if (typeof run.path !== "string" || (run.path !== CI_WORKFLOW_PATH && !run.path.startsWith(`${CI_WORKFLOW_PATH}@`))) {
    const workflowPath = run.path ?? "workflow path missing";
    stop("unrelated_ci_workflow_run", `The exact-head Actions run is not ci.yml (${workflowPath}).`);
  }
}

function normalizeCiWorkflowState(run, headSha) {
  return requireCiWorkflowState(normalizeCheckRun({ ...run, name: "ci.yml" }, headSha));
}

function requireCiWorkflowState(check) {
  if (check.bucket === "pending") {
    return "pending";
  }
  if (check.bucket === "fail") {
    stop("ci_workflow_failed", `The exact-head ci.yml run completed with ${check.state}.`);
  }
  if (check.bucket === "pass") {
    return "pass";
  }
  const state = ciWorkflowStateLabel(check);
  stop("unknown_ci_workflow_state", `The exact-head ci.yml run has unsupported state ${state}.`);
}

function ciWorkflowStateLabel(check) {
  return check.state ?? "<missing>";
}

async function readCiWorkflowState(client, headSha) {
  const runs = requireCiWorkflowRun(await client.getCiWorkflowRuns(headSha), headSha);
  if (!runs) {
    return null;
  }

  let sawPendingRun = false;
  for (const run of runs) {
    const state = normalizeCiWorkflowState(run, headSha);
    if (state === "pending") {
      sawPendingRun = true;
    }
  }
  if (sawPendingRun) {
    return "pending";
  }
  return "pass";
}

function requireTrustedCiHead(repository, pullRequest) {
  const { headBranch, headRepository, headSha, isCrossRepository } = pullRequest;
  if (!(headSha && headBranch)) {
    stop("missing_pull_request_head", "The pull request has no trusted head SHA or branch ref for ci.yml recovery.");
  }
  if (isCrossRepository || headRepository !== repository) {
    stop("cross_repository_head", "The pull request head must belong to the current repository for ci.yml recovery.");
  }
}

async function requireUnchangedCiBranch(client, headBranch, headSha) {
  const branchRef = await client.getBranchRef(headBranch);
  if (!branchRef) {
    stop("ci_branch_not_found", `Cannot dispatch ci.yml because branch ${headBranch} no longer exists.`);
  }
  if (branchRef.sha !== headSha) {
    stop(
      "ci_branch_head_mismatch",
      `The trusted head ${headSha} no longer matches branch ${headBranch} at ${branchRef.sha}.`,
    );
  }
}

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function handleCiDispatchReadError(readError, dispatchError, headSha) {
  if (readError instanceof CompletionError || !dispatchError) {
    throw readError;
  }
  const dispatchMessage = errorMessage(dispatchError);
  const readMessage = errorMessage(readError);
  const message = [`Dispatch failed (${dispatchMessage});`, `readback failed (${readMessage}) for ${headSha}.`].join(
    " ",
  );
  stop("ci_workflow_dispatch_ambiguous", message);
}

async function readCiDispatchResult(client, headSha, dispatchError) {
  let state;
  try {
    state = await readCiWorkflowState(client, headSha);
  } catch (readError) {
    return handleCiDispatchReadError(readError, dispatchError, headSha);
  }
  if (dispatchError && !state) {
    const dispatchMessage = errorMessage(dispatchError);
    const message = [`Dispatch failed (${dispatchMessage});`, "no exact-head run was found."].join(" ");
    stop("ci_workflow_dispatch_failed", message);
  }
  return state;
}

async function dispatchMissingCiWorkflow(client, pullRequest, recovery) {
  const { headBranch, headSha } = pullRequest;
  if (recovery.dispatchedHeads.has(headSha)) {
    return null;
  }

  await requireUnchangedCiBranch(client, headBranch, headSha);
  recovery.dispatchedHeads.add(headSha);
  let dispatchError;
  try {
    await client.dispatchCiWorkflow(headBranch);
  } catch (error) {
    dispatchError = error;
  }
  return readCiDispatchResult(client, headSha, dispatchError);
}

async function ensureCiWorkflowRun(client, pullRequest, recovery) {
  requireTrustedCiHead(client.repository, pullRequest);
  const { headSha } = pullRequest;
  let sawPendingRun = false;
  for (let attempt = 0; attempt < recovery.pollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Each convergence poll depends on the preceding GitHub state.
    const observedState = await readOrDispatchCiWorkflow(client, pullRequest, recovery, headSha);
    if (observedState === "pass") {
      return observedState;
    }
    sawPendingRun = sawPendingCiWorkflow(sawPendingRun, observedState);
    await waitForCiWorkflowAttempt(client, attempt, recovery);
  }

  requireCiWorkflowTimeout(headSha, sawPendingRun);
}

async function readOrDispatchCiWorkflow(client, pullRequest, recovery, headSha) {
  const state = await readCiWorkflowState(client, headSha);
  if (state) {
    return state;
  }
  return dispatchMissingCiWorkflow(client, pullRequest, recovery);
}

function sawPendingCiWorkflow(sawPendingRun, observedState) {
  return sawPendingRun || observedState === "pending";
}

async function waitForCiWorkflowAttempt(client, attempt, recovery) {
  if (attempt + 1 < recovery.pollLimit) {
    await client.wait(recovery.pollMs);
  }
}

function requireCiWorkflowTimeout(headSha, sawPendingRun) {
  if (sawPendingRun) {
    const message = [`Exact-head ci.yml remained pending for ${headSha}`, "after the bounded wait."].join(" ");
    stop("ci_workflow_run_timeout", message);
  }
  const message = [`No exact-head ci.yml run appeared for ${headSha}`, "after the bounded wait."].join(" ");
  stop("ci_workflow_run_timeout", message);
}

export { createCiRecovery, ensureCiWorkflowRun };
