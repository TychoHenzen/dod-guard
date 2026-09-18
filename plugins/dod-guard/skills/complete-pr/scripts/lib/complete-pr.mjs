import { CompletionError, stop } from "./completion-error.mjs";
import { cleanupTrustedBranch } from "./trusted-cleanup.mjs";

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
  const { acceptedHead, defaultBranch, options, pullNumber } = completion;
  let trustedHead = acceptedHead;
  for (let attempt = 0; attempt < options.pollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Merge completion requires ordered polling and guarded mutations.
    let pullRequest = await client.getPullRequest(pullNumber);
    requireTrustedHead(pullRequest, trustedHead);
    requireDefaultBase(pullRequest, defaultBranch);
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
      await client.enablePullRequestAutoMerge(pullNumber, trustedHead);
    } else {
      await client.wait(options.pollMs);
    }
  }

  stop("merge_timeout", `Pull request #${pullNumber} did not merge within the bounded wait.`);
}

async function completePullRequest(client, overrides = {}) {
  const options = {
    issuePollLimit: 6,
    pollLimit: 180,
    pollMs: 10_000,
    updatePollLimit: 12,
    ...overrides,
  };
  const repository = await client.getRepository();
  let pullRequest = await client.getPullRequest();
  validateInitialState(repository, pullRequest);

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
  if (!repository.autoMergeAllowed) {
    await client.enableRepositoryAutoMerge();
  }
  pullRequest = await client.getPullRequest(pullNumber);
  requireTrustedHead(pullRequest, acceptedHead);
  requireDefaultBase(pullRequest, repository.defaultBranch);
  await client.enablePullRequestAutoMerge(pullNumber, acceptedHead);
  return waitForMerge(client, { acceptedHead, defaultBranch: repository.defaultBranch, options, pullNumber });
}

export { CompletionError, completePullRequest, recoverMergedPullRequest };
