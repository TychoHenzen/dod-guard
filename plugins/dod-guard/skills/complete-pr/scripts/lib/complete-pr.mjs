import { CompletionError, stop } from "./completion-error.mjs";
import { normalizeCheckRun } from "./check-normalization.mjs";
import { codexReviewGate } from "./codex-review.mjs";
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

function requireConvergencePullRequest(repository, expectedPullRequest, pullRequest, allowMerged) {
  if (pullRequest.headBranch !== expectedPullRequest.headBranch) {
    stop(
      "head_branch_changed",
      `Pull request head branch changed from ${expectedPullRequest.headBranch} to ${pullRequest.headBranch ?? "<missing>"}.`,
    );
  }
  if (allowMerged && pullRequest.state === "MERGED") {
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
    return;
  }
  validateInitialState(repository, pullRequest);
}

function sourceBranchRef(client, branchName) {
  if (typeof client.getSourceBranchRef === "function") {
    return client.getSourceBranchRef(branchName);
  }
  return client.getBranchRef(branchName);
}

function refSha(refs, kind) {
  return refs.find((ref) => ref.kind === kind)?.sha ?? "<missing>";
}

function convergenceProviderError(error, expectedHead, observed, operation) {
  const cause = error instanceof Error ? error.message : String(error);
  return new CompletionError(
    "head_convergence_provider_error",
    `Failed to read ${operation} while converging pull request #${observed.pullNumber} on expected synchronized SHA ${expectedHead}: ${cause}. ` +
      `Observed source branch ${observed.branchSha}, PR API head ${observed.pullRequestSha}, ` +
      `and refs/pull/${observed.pullNumber}/head ${observed.pullHeadSha}.`,
    { cause: error },
  );
}

function requireMergeRefParent(client, mergeRef, expectedHead, observed) {
  if (!mergeRef) {
    return true;
  }
  let commit;
  try {
    commit = client.getCommit(mergeRef.sha);
  } catch (error) {
    throw convergenceProviderError(
      error,
      expectedHead,
      observed,
      `synthetic merge ref refs/pull/${observed.pullNumber}/merge at ${mergeRef.sha}`,
    );
  }
  const hasExpectedParent = commit && Array.isArray(commit.parents) && commit.parents.includes(expectedHead);
  if (!hasExpectedParent) {
    return false;
  }
  return true;
}

async function readHeadConvergenceAttempt(
  client,
  { repository, initialPullRequest, attempt, trustedHead, allowMerged, isFinalAttempt },
) {
  const branchRef = await sourceBranchRef(client, initialPullRequest.headBranch);
  if (!branchRef && !allowMerged) {
    stop(
      "head_branch_not_found",
      `Source branch ${initialPullRequest.headBranch} no longer exists while converging pull request #${initialPullRequest.number}.`,
    );
  }
  if (trustedHead && branchRef && branchRef.sha !== trustedHead) {
    stop(
      "head_branch_changed",
      `Source branch ${initialPullRequest.headBranch} moved from ${trustedHead} to ${branchRef.sha}.`,
    );
  }
  let pullRequest = initialPullRequest;
  if (attempt !== 0) {
    pullRequest = await client.getPullRequest(initialPullRequest.number);
  }
  requireConvergencePullRequest(repository, initialPullRequest, pullRequest, allowMerged);
  const sourceHead = branchRef?.sha ?? pullRequest.headSha;
  if (trustedHead && sourceHead !== trustedHead) {
    stop(
      "head_branch_changed",
      `Source branch ${initialPullRequest.headBranch} moved from ${trustedHead} to ${sourceHead}.`,
    );
  }
  const expectedHead = trustedHead ?? sourceHead;
  const observed = {
    branchSha: branchRef?.sha ?? "<absent>",
    pullNumber: initialPullRequest.number,
    pullRequestSha: pullRequest.headSha ?? "<missing>",
    pullHeadSha: "<unread>",
  };
  let refs;
  try {
    refs = await client.getPullRequestRefs(initialPullRequest.number);
  } catch (error) {
    throw convergenceProviderError(error, expectedHead, observed, "temporary pull-request refs");
  }
  observed.pullHeadSha = refSha(refs, "head");
  const mergeRef = refs.find((ref) => ref.kind === "merge");
  const identitiesConverged = pullRequest.headSha === expectedHead && observed.pullHeadSha === expectedHead;
  const mergeParentConverged = requireMergeRefParent(client, mergeRef, expectedHead, observed);
  if (!mergeParentConverged && (identitiesConverged || isFinalAttempt)) {
    stop(
      "head_merge_ref_mismatch",
      `refs/pull/${observed.pullNumber}/merge at ${mergeRef.sha} does not identify ${expectedHead} as a source parent.`,
    );
  }
  return {
    converged: identitiesConverged && mergeParentConverged,
    observed,
    pullRequest,
    sourceHead,
  };
}

async function waitForHeadConvergence(client, {
  repository,
  initialPullRequest,
  options,
  expectedHead = null,
  allowMerged = false,
}) {
  let trustedHead = expectedHead;
  let lastObserved = null;
  for (let attempt = 0; attempt < options.headPollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Each convergence poll depends on the preceding provider state.
    const result = await readHeadConvergenceAttempt(client, {
      allowMerged,
      attempt,
      initialPullRequest,
      repository,
      trustedHead,
      isFinalAttempt: attempt + 1 === options.headPollLimit,
    });
    if (!trustedHead) {
      trustedHead = result.sourceHead;
    }
    if (result.sourceHead !== trustedHead) {
      stop(
        "head_branch_changed",
        `Source branch ${initialPullRequest.headBranch} moved from ${trustedHead} to ${result.sourceHead}.`,
      );
    }
    lastObserved = result.observed;
    if (result.converged) {
      return result.pullRequest;
    }
    if (attempt + 1 < options.headPollLimit) {
      await client.wait(options.pollMs);
    }
  }

  stop(
    "head_convergence_timeout",
    `Pull request #${initialPullRequest.number} did not converge on ${trustedHead} after the bounded wait; ` +
      `observed source branch ${lastObserved?.branchSha ?? "<missing>"}, PR API head ${lastObserved?.pullRequestSha ?? "<missing>"}, ` +
      `and refs/pull/${initialPullRequest.number}/head ${lastObserved?.pullHeadSha ?? "<missing>"}.`,
  );
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
  if (runs.length === 0) {
    return null;
  }

  const runsByEvent = new Map();
  for (const run of runs) {
    const hasEvent =
      run && typeof run === "object" &&
      typeof run.event === "string" && run.event.length > 0;
    if (!hasEvent) {
      stop(
        "unknown_ci_workflow_state",
        `GitHub returned an invalid ci.yml run event for ${headSha}.`,
      );
    }
    if (runsByEvent.has(run.event)) {
      stop(
        "duplicate_ci_workflow_run",
        `Found multiple ci.yml runs for ${headSha} and event ${run.event}.`,
      );
    }
    runsByEvent.set(run.event, requireExactCiWorkflowRun(run, headSha));
  }

  return [...runsByEvent.values()];
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
  const runs = requireCiWorkflowRun(
    await client.getCiWorkflowRuns(headSha),
    headSha,
  );
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
  const { baseHead, defaultBranch, options, previousHead, pullNumber, repository } = update;
  for (let attempt = 0; attempt < options.updatePollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Each poll depends on the preceding GitHub state.
    const pullRequest = await client.getPullRequest(pullNumber);
    requireDefaultBase(pullRequest, defaultBranch);
    if (pullRequest.headSha === previousHead) {
      await client.wait(options.pollMs);
    } else {
      const convergedPullRequest = await waitForHeadConvergence(
        client,
        { expectedHead: pullRequest.headSha, initialPullRequest: pullRequest, options, repository },
      );
      const commit = await client.getCommit(convergedPullRequest.headSha);
      const parents = new Set(commit.parents);
      if (commit.parents.length !== 2 || !parents.has(previousHead) || !parents.has(baseHead)) {
        stop(
          "untrusted_base_update",
          `Updated head ${convergedPullRequest.headSha} is not the guarded merge of ${previousHead} and ${baseHead}.`,
        );
      }
      return convergedPullRequest;
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
    if (!Array.isArray(statuses) || statuses.length !== 1 || statuses[0] !== "Done") {
      stop("project_not_done", `Linked issue #${issues[index].number} is not in a Done project status.`);
    }
  }
}

async function recoverMergedPullRequest(client, overrides = {}) {
  const options = {
    headPollLimit: 6,
    issuePollLimit: 6,
    pollMs: 10_000,
    dryRun: false,
    ...overrides,
  };
  const repository = await client.getRepository();
  const pullRequest = await client.getPullRequest();
  validateMergedRecoveryState(repository, pullRequest);
  const synchronizedPullRequest = await waitForHeadConvergence(
    client,
    { allowMerged: true, initialPullRequest: pullRequest, options, repository },
  );

  const checksPassed = inspectRequiredChecks(await client.getRequiredChecks(synchronizedPullRequest.number, synchronizedPullRequest));
  if (!checksPassed) {
    stop("unverified_merge", "The pull request merged without complete required-check evidence.");
  }

  const linkedIssues = await confirmClosedIssues(client, pullRequest.number, options);
  await confirmDoneProjects(client, linkedIssues);
  const cleanup = await cleanupTrustedBranch(client, {
    branchName: synchronizedPullRequest.headBranch,
    defaultBranch: repository.defaultBranch,
    dryRun: options.dryRun,
    localGit: options.localGit,
    trustedHead: synchronizedPullRequest.headSha,
  });

  return {
    acceptedHead: synchronizedPullRequest.headSha,
    branch: cleanup.branch,
    headBranch: synchronizedPullRequest.headBranch,
    linkedIssues,
    local: cleanup.local,
    mergeCommitSha: synchronizedPullRequest.mergeCommitSha,
    pullNumber: synchronizedPullRequest.number,
    trustedHead: synchronizedPullRequest.headSha,
  };
}

// Codex's findings reach the merge as a stop for /fix-pr-review, never as a
// comment that arrives after the pull request has merged.
function codexReviewAllowsMerge(client, completion, codexWaitedMs) {
  const { acceptedHead, pullNumber, readyAt } = completion;
  const review = codexReviewGate({ ...client.getCodexReview(pullNumber), acceptedHead, readyAt, waitedMs: codexWaitedMs });
  if (review.action === "stop") {
    const findings = (review.findings ?? []).map(({ id, severity, title, url }) => `${id} ${severity} ${title} ${url}`);
    stop(review.reason, [`Codex review blocks the merge of #${pullNumber} (${review.reason}).`, ...findings].join("\n"));
  }
  return review.action === "pass";
}

async function waitForMerge(client, completion) {
  const {
    acceptedHead,
    ciRecovery,
    defaultBranch,
    options,
    pullNumber,
    repository,
  } = completion;
  let trustedHead = acceptedHead;
  let codexWaitedMs = 0;
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
        repository,
      });
      trustedHead = pullRequest.headSha;
    } else if (checksPassed && codexReviewAllowsMerge(client, completion, codexWaitedMs)) {
      await client.mergePullRequest(pullNumber, trustedHead);
    } else {
      if (checksPassed) codexWaitedMs += options.pollMs;
      await client.wait(options.pollMs);
    }
  }

  stop("merge_timeout", `Pull request #${pullNumber} did not merge within the bounded wait.`);
}

async function completePullRequest(client, overrides = {}) {
  const options = {
    ciRunPollLimit: 12,
    headPollLimit: 6,
    issuePollLimit: 6,
    pollLimit: 180,
    pollMs: 10_000,
    updatePollLimit: 12,
    now: Date.now,
    ...overrides,
  };
  const repository = await client.getRepository();
  let pullRequest = await client.getPullRequest();
  validateInitialState(repository, pullRequest);
  pullRequest = await waitForHeadConvergence(client, {
    expectedHead: options.pushedHead ?? null,
    initialPullRequest: pullRequest,
    options,
    repository,
  });
  const ciRecovery = createCiRecovery(options);

  const acceptedHead = pullRequest.headSha;
  const pullNumber = pullRequest.number;
  let readyAt;
  if (pullRequest.isDraft) {
    readyAt = options.now();
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
  return waitForMerge(client, {
    acceptedHead,
    ciRecovery,
    defaultBranch: repository.defaultBranch,
    options,
    pullNumber,
    readyAt,
    repository,
  });
}

export { CompletionError, completePullRequest, recoverMergedPullRequest, waitForHeadConvergence };
