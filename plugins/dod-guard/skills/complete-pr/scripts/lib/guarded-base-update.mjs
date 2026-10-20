// Updates a behind pull request against the live base tip and verifies the new head.
import { stop } from "./completion-error.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";
import { requireDefaultBase } from "./merge-gates.mjs";

// The pull request's base SHA advances only after GitHub applies the update, so the guard reads the branch ref itself.
async function readBaseBranchTip(client, defaultBranch) {
  const baseRef = await client.getBaseBranchRef(defaultBranch);
  if (!baseRef) {
    stop("base_branch_missing", `The base branch ${defaultBranch} has no remote ref to guard a branch update against.`);
  }
  return baseRef.sha;
}

async function waitForGuardedUpdate(client, update) {
  const { baseHead, defaultBranch, options, previousHead, pullNumber, repository } = update;
  for (let attempt = 0; attempt < options.updatePollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Each poll depends on the preceding GitHub state.
    const pullRequest = await client.getPullRequest(pullNumber);
    requireDefaultBase(pullRequest, defaultBranch);
    if (pullRequest.headSha === previousHead) {
      await client.wait(options.pollMs);
      continue;
    }
    const convergedPullRequest = await waitForHeadConvergence(client, {
      expectedHead: pullRequest.headSha,
      initialPullRequest: pullRequest,
      options,
      repository,
    });
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

  stop("base_update_timeout", "GitHub accepted the base update but did not publish its new head in time.");
}

export { readBaseBranchTip, waitForGuardedUpdate };
