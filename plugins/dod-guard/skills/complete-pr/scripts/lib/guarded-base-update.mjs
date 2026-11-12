// Updates a behind pull request against the live base tip, verifies the new head, and stops for a fresh handoff.
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

async function requireGuardedMerge(client, headSha, expectedParents) {
  const commit = await client.getCommit(headSha);
  const parents = new Set(commit.parents);
  const guarded = commit.parents.length === 2 && expectedParents.every((parent) => parents.has(parent));
  if (!guarded) {
    const [previousHead, baseHead] = expectedParents;
    stop(
      "untrusted_base_update",
      `Updated head ${headSha} is not the guarded merge of ${previousHead} and ${baseHead}.`,
    );
  }
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
    await requireGuardedMerge(client, convergedPullRequest.headSha, [previousHead, baseHead]);
    return convergedPullRequest;
  }

  stop("base_update_timeout", "GitHub accepted the base update but did not publish its new head in time.");
}

function stopForSyncedBranch(previousHead, syncedHead) {
  const rebind = `Rebind the handoff to ${syncedHead} (fix-pr-review, "Rebind the handoff")`;
  stop(
    "branch_synced",
    `The branch moved from ${previousHead} to the verified sync head ${syncedHead}; nothing was merged.`,
    `${rebind}, rerun the finalization proof at it, then rerun the helper with --pushed-head ${syncedHead}.`,
  );
}

// Never returns: a synced head has no handoff evidence yet, so the run ends before any merge.
async function syncBehindBranch(client, update) {
  const { defaultBranch, options, pullNumber, repository, trustedHead } = update;
  const baseHead = await readBaseBranchTip(client, defaultBranch);
  await client.updateBranch(pullNumber, trustedHead);
  const updatedPullRequest = await waitForGuardedUpdate(client, {
    baseHead,
    defaultBranch,
    options,
    previousHead: trustedHead,
    pullNumber,
    repository,
  });
  stopForSyncedBranch(trustedHead, updatedPullRequest.headSha);
}

export { syncBehindBranch };
