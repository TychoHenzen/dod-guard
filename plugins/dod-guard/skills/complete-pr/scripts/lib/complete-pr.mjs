import { CompletionError, stop } from "./completion-error.mjs";
import { normalizeCheckRun } from "./check-normalization.mjs";
import { cleanupTrustedBranch } from "./trusted-cleanup.mjs";

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const FAILED_CHECK_BUCKETS = new Set(["cancel", "fail"]);
const PASSING_CHECK_BUCKETS = new Set(["pass", "skipping"]);

function requireTrustedHead(pullRequest, trustedHead) {
  if (pullRequest.headSha !== trustedHead) {
    stop(
      "unexpected_head_change",
      `Pull request head changed from ${trustedHead} to ${pullRequest.headSha}. A new acceptance signal is required.`,
    );
  }
}

function inspectRequiredChecks(checks) {
  if (checks.length === 0) {
    stop("missing_required_checks", "The base branch reports no required checks for this pull request.");
  }

  const failed = checks.filter((check) => FAILED_CHECK_BUCKETS.has(check.bucket));
  if (failed.length > 0) {
    const summary = failed.map((check) => `${check.name}=${check.state}`).join(", ");
    stop("required_check_failed", `Required checks did not pass: ${summary}.`);
  }

  const unknown = checks.filter((check) => !PASSING_CHECK_BUCKETS.has(check.bucket) && check.bucket !== "pending");
  if (unknown.length > 0) {
    const summary = unknown.map((check) => `${check.name}=${check.state ?? check.bucket}`).join(", ");
    stop("unknown_check_state", `Required checks returned unsupported states: ${summary}.`);
  }

  return checks.every((check) => PASSING_CHECK_BUCKETS.has(check.bucket));
}

function validateInitialState(repository, pullRequest) {
  if (pullRequest.state !== "OPEN") {
    stop("not_open_pull_request", "The selected pull request must be open.");
  }
  if (pullRequest.isCrossRepository || pullRequest.headRepository !== repository.nameWithOwner) {
    stop("cross_repository_head", "The pull request head must belong to the current repository.");
  }
  requireDefaultBase(pullRequest, repository.defaultBranch);
  if (pullRequest.headBranch === repository.defaultBranch) {
    stop("default_branch_head", "The pull request head cannot be the default branch.");
  }
  if (!repository.canPush) {
    stop("missing_permission", "The active GitHub user lacks repository push permission.");
  }
}

function requireDefaultBase(pullRequest, defaultBranch) {
  if (pullRequest.baseBranch !== defaultBranch) {
    stop("wrong_base_branch", `The pull request must target ${defaultBranch}.`);
  }
}

function createCiRecovery(options) {
  return {
    dispatchedHeads: new Set(),
    pollLimit: options.ciRunPollLimit,
    pollMs: options.pollMs,
  };
}

function requireCiWorkflowRun(runs, headSha) {
  if (!Array.isArray(runs)) {
    stop(
      "unknown_ci_workflow_state",
      `GitHub returned an invalid run list for ${headSha}.`,
    );
  }
  if (runs.length > 1) {
    stop(
      "duplicate_ci_workflow_run",
      `Found multiple ci.yml runs for ${headSha}.`,
    );
  }
  if (runs.length === 0) {
    return null;
  }

  return requireExactCiWorkflowRun(runs[0], headSha);
}

function requireExactCiWorkflowRun(run, headSha) {
  if (!run || typeof run !== "object") {
    stop(
      "unknown_ci_workflow_state",
      `GitHub returned an invalid ci.yml run for ${headSha}.`,
    );
  }
  requireMatchingCiHead(run, headSha);
  requireCiWorkflowPath(run);

  return run;
}

function requireMatchingCiHead(run, headSha) {
  if (run.head_sha !== headSha) {
    const reportedHead = run.head_sha ?? "<missing>";
    stop(
      "stale_ci_workflow_run",
      `The ci.yml run reports ${reportedHead}, not trusted head ${headSha}.`,
    );
  }
}

function requireCiWorkflowPath(run) {
  if (
    typeof run.path !== "string" ||
    (run.path !== CI_WORKFLOW_PATH &&
      !run.path.startsWith(`${CI_WORKFLOW_PATH}@`))
  ) {
    const workflowPath = run.path ?? "workflow path missing";
    stop(
      "unrelated_ci_workflow_run",
      `The exact-head Actions run is not ci.yml (${workflowPath}).`,
    );
  }
}

function normalizeCiWorkflowState(run, headSha) {
  return requireCiWorkflowState(
    normalizeCheckRun({ ...run, name: "ci.yml" }, headSha),
  );
}

function requireCiWorkflowState(check) {
  if (check.bucket === "pending") {
    return "pending";
  }
  if (check.bucket === "fail") {
    stop(
      "ci_workflow_failed",
      `The exact-head ci.yml run completed with ${check.state}.`,
    );
  }
  if (check.bucket === "pass") {
    return "pass";
  }
  const state = ciWorkflowStateLabel(check);
  stop(
    "unknown_ci_workflow_state",
    `The exact-head ci.yml run has unsupported state ${state}.`,
  );
}

function ciWorkflowStateLabel(check) {
  return check.state ?? "<missing>";
}

async function readCiWorkflowState(client, headSha) {
  const run = requireCiWorkflowRun(
    await client.getCiWorkflowRuns(headSha),
    headSha,
  );
  return run ? normalizeCiWorkflowState(run, headSha) : null;
}

function requireTrustedCiHead(repository, pullRequest) {
  const {
    headBranch,
    headRepository,
    headSha,
    isCrossRepository,
  } = pullRequest;
  if (!headSha || !headBranch) {
    stop(
      "missing_pull_request_head",
      "The pull request has no trusted head SHA " +
        "or branch ref for ci.yml recovery.",
    );
  }
  if (isCrossRepository || headRepository !== repository) {
    stop(
      "cross_repository_head",
      "The pull request head must belong to the current repository " +
        "for ci.yml recovery.",
    );
  }
}

async function requireUnchangedCiBranch(client, headBranch, headSha) {
  const branchRef = await client.getBranchRef(headBranch);
  if (!branchRef) {
    stop(
      "ci_branch_not_found",
      `Cannot dispatch ci.yml because branch ${headBranch} no longer exists.`,
    );
  }
  if (branchRef.sha !== headSha) {
    stop(
      "ci_branch_head_mismatch",
      `The trusted head ${headSha} no longer matches branch ${headBranch} at ${
        branchRef.sha
      }.`,
    );
  }
}

function handleCiDispatchReadError(readError, dispatchError, headSha) {
  if (readError instanceof CompletionError || !dispatchError) {
    throw readError;
  }
  const dispatchMessage =
    dispatchError instanceof Error
      ? dispatchError.message
      : String(dispatchError);
  const readMessage =
    readError instanceof Error
      ? readError.message
      : String(readError);
  const message = [
    `Dispatch failed (${dispatchMessage});`,
    `readback failed (${readMessage}) for ${headSha}.`,
  ].join(" ");
  stop(
    "ci_workflow_dispatch_ambiguous",
    message,
  );
}

async function readCiDispatchResult(client, headSha, dispatchError) {
  let state;
  try {
    state = await readCiWorkflowState(client, headSha);
  } catch (readError) {
    return handleCiDispatchReadError(readError, dispatchError, headSha);
  }
  if (dispatchError && !state) {
    const dispatchMessage =
      dispatchError instanceof Error
        ? dispatchError.message
        : String(dispatchError);
    const message = [
      `Dispatch failed (${dispatchMessage});`,
      "no exact-head run was found.",
    ].join(" ");
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
    const observedState = await readOrDispatchCiWorkflow(
      client,
      pullRequest,
      recovery,
      headSha,
    );
    if (observedState === "pass") {
      return observedState;
    }
    sawPendingRun = sawPendingCiWorkflow(sawPendingRun, observedState);
    await waitForCiWorkflowAttempt(client, attempt, recovery);
  }

  requireCiWorkflowTimeout(headSha, sawPendingRun);
}

async function readOrDispatchCiWorkflow(
  client,
  pullRequest,
  recovery,
  headSha,
) {
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
    const message = [
      `Exact-head ci.yml remained pending for ${headSha}`,
      "after the bounded wait.",
    ].join(" ");
    stop(
      "ci_workflow_run_timeout",
      message,
    );
  }
  const message = [
    `No exact-head ci.yml run appeared for ${headSha}`,
    "after the bounded wait.",
  ].join(" ");
  stop(
    "ci_workflow_run_timeout",
    message,
  );
}

async function waitForGuardedUpdate(client, update) {
  const { baseHead, defaultBranch, options, previousHead, pullNumber } = update;
  for (let attempt = 0; attempt < options.updatePollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Each poll depends on the preceding GitHub state.
    const pullRequest = await client.getPullRequest(pullNumber);
    requireDefaultBase(pullRequest, defaultBranch);
    if (pullRequest.headSha === previousHead) {
      await client.wait(options.pollMs);
    } else {
      const commit = await client.getCommit(pullRequest.headSha);
      const parents = new Set(commit.parents);
      if (commit.parents.length !== 2 || !parents.has(previousHead) || !parents.has(baseHead)) {
        stop(
          "untrusted_base_update",
          `Updated head ${pullRequest.headSha} is not the guarded merge of ${previousHead} and ${baseHead}.`,
        );
      }
      return pullRequest;
    }
  }

  stop("base_update_timeout", "GitHub accepted the base update but did not publish its new head in time.");
}

async function confirmClosedIssues(client, pullNumber, options) {
  for (let attempt = 0; attempt < options.issuePollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Linked issue closure is eventually consistent after merge.
    const issues = await client.getLinkedIssues(pullNumber);
    if (issues.length === 0) {
      stop("missing_linked_issue", "The merged pull request has no closing issue reference.");
    }
    if (issues.every((issue) => issue.state === "CLOSED")) {
      return issues;
    }
    await client.wait(options.pollMs);
  }

  stop("linked_issue_open", "A linked closing issue remained open after the pull request merged.");
}

function validateMergedRecoveryState(repository, pullRequest) {
  if (pullRequest.state !== "MERGED") {
    stop("not_merged_pull_request", "The selected pull request must already be merged.");
  }
  if (pullRequest.isCrossRepository || pullRequest.headRepository !== repository.nameWithOwner) {
    stop("cross_repository_head", "The pull request head must belong to the current repository.");
  }
  if (pullRequest.baseBranch !== repository.defaultBranch) {
    stop("wrong_base_branch", `The pull request must target ${repository.defaultBranch}.`);
  }
  if (pullRequest.headBranch === repository.defaultBranch) {
    stop("default_branch_head", "The pull request head cannot be the default branch.");
  }
  if (!repository.canPush) {
    stop("missing_permission", "The active GitHub user lacks repository push permission.");
  }
  if (!(pullRequest.headSha && pullRequest.mergeCommitSha)) {
    stop("unverified_merge", "The merged pull request lacks a trusted head or merge commit.");
  }
}

async function confirmDoneProjects(client, issues) {
  const projectStatuses = await Promise.all(issues.map((issue) => client.getIssueProjectStatuses(issue.number)));
  for (let index = 0; index < issues.length; index += 1) {
    const statuses = projectStatuses[index];
    if (!statuses.includes("Done")) {
      stop("project_not_done", `Linked issue #${issues[index].number} is not in a Done project status.`);
    }
  }
}

async function recoverMergedPullRequest(client, overrides = {}) {
  const options = {
    issuePollLimit: 6,
    pollMs: 10_000,
    dryRun: false,
    ...overrides,
  };
  const repository = await client.getRepository();
  const pullRequest = await client.getPullRequest();
  validateMergedRecoveryState(repository, pullRequest);

  const checksPassed = inspectRequiredChecks(await client.getRequiredChecks(pullRequest.number, pullRequest));
  if (!checksPassed) {
    stop("unverified_merge", "The pull request merged without complete required-check evidence.");
  }

  const linkedIssues = await confirmClosedIssues(client, pullRequest.number, options);
  await confirmDoneProjects(client, linkedIssues);
  const cleanup = await cleanupTrustedBranch(client, {
    branchName: pullRequest.headBranch,
    defaultBranch: repository.defaultBranch,
    dryRun: options.dryRun,
    localGit: options.localGit,
    trustedHead: pullRequest.headSha,
  });

  return {
    acceptedHead: pullRequest.headSha,
    branch: cleanup.branch,
    headBranch: pullRequest.headBranch,
    linkedIssues,
    local: cleanup.local,
    mergeCommitSha: pullRequest.mergeCommitSha,
    pullNumber: pullRequest.number,
    trustedHead: pullRequest.headSha,
  };
}

async function waitForMerge(client, completion) {
  const {
    acceptedHead,
    ciRecovery,
    defaultBranch,
    options,
    pullNumber,
  } = completion;
  let trustedHead = acceptedHead;
  for (let attempt = 0; attempt < options.pollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Merge completion requires ordered polling and guarded mutations.
    let pullRequest = await client.getPullRequest(pullNumber);
    requireTrustedHead(pullRequest, trustedHead);
    requireDefaultBase(pullRequest, defaultBranch);
    await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
    const checksPassed = inspectRequiredChecks(await client.getRequiredChecks(pullNumber, pullRequest));

    if (pullRequest.state === "MERGED") {
      if (!(checksPassed && pullRequest.mergeCommitSha)) {
        stop("unverified_merge", "The pull request merged without complete required-check evidence.");
      }
      const linkedIssues = await confirmClosedIssues(client, pullNumber, options);
      const cleanup = await cleanupTrustedBranch(client, {
        branchName: pullRequest.headBranch,
        defaultBranch,
        localGit: options.localGit,
        trustedHead,
      });
      return {
        acceptedHead,
        branch: cleanup.branch,
        headBranch: pullRequest.headBranch,
        linkedIssues,
        local: cleanup.local,
        mergeCommitSha: pullRequest.mergeCommitSha,
        pullNumber,
        trustedHead,
      };
    }

    if (pullRequest.state !== "OPEN") {
      stop("pull_request_closed", `Pull request #${pullNumber} closed without merging.`);
    }
    if (pullRequest.mergeable === "CONFLICTING" || pullRequest.mergeState === "DIRTY") {
      stop("merge_conflict", `Pull request #${pullNumber} has merge conflicts.`);
    }

    if (pullRequest.mergeState === "BEHIND") {
      const previousHead = trustedHead;
      const baseHead = pullRequest.baseSha;
      await client.updateBranch(pullNumber, previousHead);
      pullRequest = await waitForGuardedUpdate(client, {
        baseHead,
        defaultBranch,
        options,
        previousHead,
        pullNumber,
      });
      trustedHead = pullRequest.headSha;
      await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
      await client.enablePullRequestAutoMerge(pullNumber, trustedHead);
    } else {
      await client.wait(options.pollMs);
    }
  }

  stop("merge_timeout", `Pull request #${pullNumber} did not merge within the bounded wait.`);
}

async function completePullRequest(client, overrides = {}) {
  const options = {
    ciRunPollLimit: 12,
    issuePollLimit: 6,
    pollLimit: 180,
    pollMs: 10_000,
    updatePollLimit: 12,
    ...overrides,
  };
  const repository = await client.getRepository();
  let pullRequest = await client.getPullRequest();
  validateInitialState(repository, pullRequest);
  const ciRecovery = createCiRecovery(options);

  const acceptedHead = pullRequest.headSha;
  const pullNumber = pullRequest.number;
  if (pullRequest.isDraft) {
    await client.markReady(pullNumber);
    pullRequest = await client.getPullRequest(pullNumber);
    requireTrustedHead(pullRequest, acceptedHead);
    requireDefaultBase(pullRequest, repository.defaultBranch);
    if (pullRequest.isDraft) {
      stop(
        "ready_transition_failed",
        `Pull request #${pullNumber} remained a draft after the ready transition.`,
      );
    }
  }

  requireDefaultBase(pullRequest, repository.defaultBranch);
  await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
  if (!repository.autoMergeAllowed) {
    await client.enableRepositoryAutoMerge();
  }
  pullRequest = await client.getPullRequest(pullNumber);
  requireTrustedHead(pullRequest, acceptedHead);
  requireDefaultBase(pullRequest, repository.defaultBranch);
  await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
  await client.enablePullRequestAutoMerge(pullNumber, acceptedHead);
  return waitForMerge(client, {
    acceptedHead,
    ciRecovery,
    defaultBranch: repository.defaultBranch,
    options,
    pullNumber,
  });
}

export { CompletionError, completePullRequest, recoverMergedPullRequest };
