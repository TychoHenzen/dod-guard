// Waits until the pull request API, the source branch, and the temporary pull refs name one head.
import { CompletionError, stop } from "./completion-error.mjs";
import { requireOwnRepositoryHead, validateInitialState } from "./merge-gates.mjs";

function requireSourceHeadUnmoved(branchName, trustedHead, observedSha) {
  if (trustedHead && observedSha !== trustedHead) {
    stop("head_branch_changed", `Source branch ${branchName} moved from ${trustedHead} to ${observedSha}.`);
  }
}

function requireConvergencePullRequest(repository, expectedPullRequest, pullRequest, allowMerged) {
  if (pullRequest.headBranch !== expectedPullRequest.headBranch) {
    const observedBranch = pullRequest.headBranch ?? "<missing>";
    stop(
      "head_branch_changed",
      `Pull request head branch changed from ${expectedPullRequest.headBranch} to ${observedBranch}.`,
    );
  }
  if (allowMerged && pullRequest.state === "MERGED") {
    requireOwnRepositoryHead(repository, pullRequest);
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
  const { branchSha, pullHeadSha, pullNumber, pullRequestSha } = observed;
  return new CompletionError(
    "head_convergence_provider_error",
    `Failed to read ${operation} while converging pull request #${pullNumber} ` +
      `on expected synchronized SHA ${expectedHead}: ${cause}. ` +
      `Observed source branch ${branchSha}, PR API head ${pullRequestSha}, ` +
      `and refs/pull/${pullNumber}/head ${pullHeadSha}.`,
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

async function readSourceBranch(client, { allowMerged, initialPullRequest, trustedHead }) {
  const { headBranch, number } = initialPullRequest;
  const branchRef = await sourceBranchRef(client, headBranch);
  if (!(branchRef || allowMerged)) {
    stop(
      "head_branch_not_found",
      `Source branch ${headBranch} no longer exists while converging pull request #${number}.`,
    );
  }
  if (branchRef) {
    requireSourceHeadUnmoved(headBranch, trustedHead, branchRef.sha);
  }
  return branchRef;
}

function readAttemptPullRequest(client, initialPullRequest, attempt) {
  if (attempt === 0) {
    return initialPullRequest;
  }
  return client.getPullRequest(initialPullRequest.number);
}

async function readTemporaryRefs(client, expectedHead, observed) {
  try {
    return await client.getPullRequestRefs(observed.pullNumber);
  } catch (error) {
    throw convergenceProviderError(error, expectedHead, observed, "temporary pull-request refs");
  }
}

function judgeConvergence(client, { expectedHead, isFinalAttempt, observed, pullRequest, refs }) {
  const mergeRef = refs.find((ref) => ref.kind === "merge");
  const identitiesConverged = pullRequest.headSha === expectedHead && observed.pullHeadSha === expectedHead;
  const mergeParentConverged = requireMergeRefParent(client, mergeRef, expectedHead, observed);
  if (!mergeParentConverged && (identitiesConverged || isFinalAttempt)) {
    stop(
      "head_merge_ref_mismatch",
      `refs/pull/${observed.pullNumber}/merge at ${mergeRef.sha} does not identify ${expectedHead} as a source parent.`,
    );
  }
  return identitiesConverged && mergeParentConverged;
}

async function readHeadConvergenceAttempt(client, input) {
  const { allowMerged, attempt, initialPullRequest, isFinalAttempt, repository, trustedHead } = input;
  const branchRef = await readSourceBranch(client, { allowMerged, initialPullRequest, trustedHead });
  const pullRequest = await readAttemptPullRequest(client, initialPullRequest, attempt);
  requireConvergencePullRequest(repository, initialPullRequest, pullRequest, allowMerged);
  const sourceHead = branchRef?.sha ?? pullRequest.headSha;
  requireSourceHeadUnmoved(initialPullRequest.headBranch, trustedHead, sourceHead);
  const expectedHead = trustedHead ?? sourceHead;
  const observed = {
    branchSha: branchRef?.sha ?? "<absent>",
    pullNumber: initialPullRequest.number,
    pullRequestSha: pullRequest.headSha ?? "<missing>",
    pullHeadSha: "<unread>",
  };
  const refs = await readTemporaryRefs(client, expectedHead, observed);
  observed.pullHeadSha = refSha(refs, "head");
  const converged = judgeConvergence(client, { expectedHead, isFinalAttempt, observed, pullRequest, refs });
  return { converged, observed, pullRequest, sourceHead };
}

function stopOnConvergenceTimeout(initialPullRequest, trustedHead, lastObserved) {
  const { branchSha = "<missing>", pullHeadSha = "<missing>", pullRequestSha = "<missing>" } = lastObserved ?? {};
  stop(
    "head_convergence_timeout",
    `Pull request #${initialPullRequest.number} did not converge on ${trustedHead} after the bounded wait; ` +
      `observed source branch ${branchSha}, PR API head ${pullRequestSha}, ` +
      `and refs/pull/${initialPullRequest.number}/head ${pullHeadSha}.`,
  );
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
    lastObserved = result.observed;
    if (result.converged) {
      return result.pullRequest;
    }
    if (attempt + 1 < options.headPollLimit) {
      await client.wait(options.pollMs);
    }
  }

  stopOnConvergenceTimeout(initialPullRequest, trustedHead, lastObserved);
}

export { waitForHeadConvergence };
