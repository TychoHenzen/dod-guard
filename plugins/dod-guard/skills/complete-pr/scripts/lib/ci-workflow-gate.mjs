// Reads, and when it is missing dispatches, the exact-head ci.yml run that must pass before the merge.
import { dispatchMissingCiWorkflow, requireTrustedCiHead } from "./ci-workflow-dispatch.mjs";
import { readCiWorkflowState } from "./ci-workflow-state.mjs";
import { stop } from "./completion-error.mjs";

function createCiRecovery(options) {
  return {
    dispatchedHeads: new Set(),
    pollLimit: options.ciRunPollLimit,
    pollMs: options.pollMs,
  };
}

async function ensureCiWorkflowRun(client, pullRequest, recovery) {
  requireTrustedCiHead(client.repository, pullRequest);
  const { headSha } = pullRequest;
  let sawPendingRun = false;
  for (let attempt = 0; attempt < recovery.pollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Each convergence poll depends on the preceding GitHub state.
    const observedState = await readOrDispatchCiWorkflow(client, pullRequest, recovery);
    if (observedState === "pass") {
      return observedState;
    }
    sawPendingRun = sawPendingCiWorkflow(sawPendingRun, observedState);
    await waitForCiWorkflowAttempt(client, attempt, recovery);
  }

  requireCiWorkflowTimeout(headSha, sawPendingRun);
}

async function readOrDispatchCiWorkflow(client, pullRequest, recovery) {
  const state = await readCiWorkflowState(client, pullRequest.headSha);
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
