// Dispatches ci.yml for a head with no run yet and reads back what GitHub made of it.

import { readCiWorkflowState } from "./ci-workflow-state.mjs";
import { CompletionError, stop } from "./completion-error.mjs";

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

export { dispatchMissingCiWorkflow, requireTrustedCiHead };
