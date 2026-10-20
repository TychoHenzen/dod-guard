// The /complete-pr merge loop: ready, guarded base updates, merge, and cleanup.
import { createCiRecovery, ensureCiWorkflowRun } from "./ci-workflow-gate.mjs";
import { confirmClosedIssues, requireClosingIssue } from "./closing-issue-gate.mjs";
import { stop } from "./completion-error.mjs";
import { updateBehindBranch } from "./guarded-base-update.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";
import {
  inspectRequiredChecks,
  readTrustedPullRequest,
  requireDefaultBase,
  requireNoUnresolvedThreads,
  validateInitialState,
} from "./merge-gates.mjs";
import { cleanupTrustedBranch } from "./trusted-cleanup.mjs";

const DEFAULT_OPTIONS = {
  ciRunPollLimit: 12,
  headPollLimit: 6,
  issuePollLimit: 6,
  pollLimit: 180,
  pollMs: 10_000,
  updatePollLimit: 12,
};

async function finishMergedPullRequest(client, merged) {
  const { acceptedHead, checksPassed, defaultBranch, options, pullNumber, pullRequest, trustedHead } = merged;
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

function requireOpenMergeable(pullRequest, pullNumber) {
  if (pullRequest.state !== "OPEN") {
    stop("pull_request_closed", `Pull request #${pullNumber} closed without merging.`);
  }
  if (pullRequest.mergeable === "CONFLICTING" || pullRequest.mergeState === "DIRTY") {
    stop("merge_conflict", `Pull request #${pullNumber} has merge conflicts.`);
  }
}

// Returns the head the next poll must trust.
async function advanceOpenPullRequest(client, step) {
  const { checksPassed, completion, pullRequest, trustedHead } = step;
  const { defaultBranch, options, pullNumber, repository } = completion;
  if (pullRequest.mergeState === "BEHIND") {
    return updateBehindBranch(client, { defaultBranch, options, pullNumber, repository, trustedHead });
  }
  if (checksPassed) {
    await requireNoUnresolvedThreads(client, pullNumber);
    await client.mergePullRequest(pullNumber, trustedHead);
  } else {
    await client.wait(options.pollMs);
  }
  return trustedHead;
}

async function waitForMerge(client, completion) {
  const { acceptedHead, ciRecovery, defaultBranch, options, pullNumber } = completion;
  let trustedHead = acceptedHead;
  for (let attempt = 0; attempt < options.pollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Merge completion requires ordered polling and guarded mutations.
    const pullRequest = await readTrustedPullRequest(client, { defaultBranch, pullNumber, trustedHead });
    await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
    const checksPassed = inspectRequiredChecks(await client.getRequiredChecks(pullRequest));

    if (pullRequest.state === "MERGED") {
      const merged = { acceptedHead, checksPassed, defaultBranch, options, pullNumber, pullRequest, trustedHead };
      return finishMergedPullRequest(client, merged);
    }

    requireOpenMergeable(pullRequest, pullNumber);
    trustedHead = await advanceOpenPullRequest(client, { checksPassed, completion, pullRequest, trustedHead });
  }

  stop("merge_timeout", `Pull request #${pullNumber} did not merge within the bounded wait.`);
}

async function markPullRequestReady(client, ready) {
  const { acceptedHead, defaultBranch, pullNumber } = ready;
  await client.markReady(pullNumber);
  const pullRequest = await readTrustedPullRequest(client, { defaultBranch, pullNumber, trustedHead: acceptedHead });
  if (pullRequest.isDraft) {
    stop("ready_transition_failed", `Pull request #${pullNumber} remained a draft after the ready transition.`);
  }
  return pullRequest;
}

async function completePullRequest(client, overrides = {}) {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
  const repository = await client.getRepository();
  const { defaultBranch } = repository;
  const initialPullRequest = await client.getPullRequest();
  validateInitialState(repository, initialPullRequest);
  await requireClosingIssue(client, initialPullRequest.number);
  let pullRequest = await waitForHeadConvergence(client, {
    expectedHead: options.pushedHead ?? null,
    initialPullRequest,
    options,
    repository,
  });
  const ciRecovery = createCiRecovery(options);
  await requireNoUnresolvedThreads(client, pullRequest.number);

  const acceptedHead = pullRequest.headSha;
  const pullNumber = pullRequest.number;
  if (pullRequest.isDraft) {
    pullRequest = await markPullRequestReady(client, { acceptedHead, defaultBranch, pullNumber });
  }

  requireDefaultBase(pullRequest, defaultBranch);
  await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
  if (!repository.autoMergeAllowed) {
    await client.enableRepositoryAutoMerge();
  }
  pullRequest = await readTrustedPullRequest(client, { defaultBranch, pullNumber, trustedHead: acceptedHead });
  await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
  return waitForMerge(client, { acceptedHead, ciRecovery, defaultBranch, options, pullNumber, repository });
}

export { completePullRequest };
