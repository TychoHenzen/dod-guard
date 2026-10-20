// Waits until the pull request API, the source branch, and the temporary pull refs name one head.
import { CompletionError, stop } from "./completion-error.mjs";
import { requireDefaultBase, validateInitialState } from "./merge-gates.mjs";

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

async function waitForHeadConvergence(
  client,
  { repository, initialPullRequest, options, expectedHead = null, allowMerged = false },
) {
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

export { waitForHeadConvergence };
