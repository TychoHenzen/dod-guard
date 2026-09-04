const FAILED_CHECK_BUCKETS = new Set(["cancel", "fail", "skipping"]);

class CompletionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CompletionError";
    this.code = code;
  }
}

function stop(code, message) {
  throw new CompletionError(code, message);
}

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

  const unknown = checks.filter((check) => check.bucket !== "pass" && check.bucket !== "pending");
  if (unknown.length > 0) {
    const summary = unknown.map((check) => `${check.name}=${check.bucket}`).join(", ");
    stop("unknown_check_state", `Required checks returned unsupported states: ${summary}.`);
  }

  return checks.every((check) => check.bucket === "pass");
}

function validateInitialState(repository, pullRequest) {
  if (pullRequest.state !== "OPEN" || !pullRequest.isDraft) {
    stop("not_verified_draft", "The selected pull request must be an open draft.");
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
}

async function waitForGuardedUpdate(client, update) {
  const { baseHead, options, previousHead, pullNumber } = update;
  for (let attempt = 0; attempt < options.updatePollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Each poll depends on the preceding GitHub state.
    const pullRequest = await client.getPullRequest(pullNumber);
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

async function deleteTrustedBranch(client, branchName, trustedHead) {
  const branch = await client.getBranchRef(branchName);
  if (branch === null) {
    return "already_absent";
  }
  if (branch.sha !== trustedHead) {
    stop(
      "branch_ref_changed",
      `Remote branch ${branchName} points to ${branch.sha}, not merged head ${trustedHead}; it was not deleted.`,
    );
  }

  await client.deleteBranchRef(branchName);
  if ((await client.getBranchRef(branchName)) !== null) {
    stop("branch_delete_unconfirmed", `Remote branch ${branchName} still exists after deletion.`);
  }
  return "deleted";
}

async function waitForMerge(client, completion) {
  const { acceptedHead, options, pullNumber } = completion;
  let trustedHead = acceptedHead;
  for (let attempt = 0; attempt < options.pollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Merge completion requires ordered polling and guarded mutations.
    let pullRequest = await client.getPullRequest(pullNumber);
    requireTrustedHead(pullRequest, trustedHead);
    const checksPassed = inspectRequiredChecks(await client.getRequiredChecks(pullNumber));

    if (pullRequest.state === "MERGED") {
      if (!(checksPassed && pullRequest.mergeCommitSha)) {
        stop("unverified_merge", "The pull request merged without complete required-check evidence.");
      }
      const linkedIssues = await confirmClosedIssues(client, pullNumber, options);
      const branch = await deleteTrustedBranch(client, pullRequest.headBranch, trustedHead);
      return {
        acceptedHead,
        branch,
        headBranch: pullRequest.headBranch,
        linkedIssues,
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
      pullRequest = await waitForGuardedUpdate(client, { baseHead, options, previousHead, pullNumber });
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
  await client.markReady(pullNumber);
  pullRequest = await client.getPullRequest(pullNumber);
  requireTrustedHead(pullRequest, acceptedHead);

  if (!repository.autoMergeAllowed) {
    await client.enableRepositoryAutoMerge();
  }
  pullRequest = await client.getPullRequest(pullNumber);
  requireTrustedHead(pullRequest, acceptedHead);
  await client.enablePullRequestAutoMerge(pullNumber, acceptedHead);
  return waitForMerge(client, { acceptedHead, options, pullNumber });
}

export { CompletionError, completePullRequest };
