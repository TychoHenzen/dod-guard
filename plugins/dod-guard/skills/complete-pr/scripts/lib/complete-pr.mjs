// The /complete-pr merge loop: ready, guarded base updates, merge, and cleanup.
import { createCiRecovery, ensureCiWorkflowRun } from "./ci-workflow-gate.mjs";
import { confirmClosedIssues, requireClosingIssue } from "./closing-issue-gate.mjs";
import { stop } from "./completion-error.mjs";
import { readBaseBranchTip, waitForGuardedUpdate } from "./guarded-base-update.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";
import {
  inspectRequiredChecks,
  requireDefaultBase,
  requireNoUnresolvedThreads,
  requireTrustedHead,
  validateInitialState,
} from "./merge-gates.mjs";
import { cleanupTrustedBranch } from "./trusted-cleanup.mjs";

async function waitForMerge(client, completion) {
  const { acceptedHead, ciRecovery, defaultBranch, options, pullNumber, repository } = completion;
  let trustedHead = acceptedHead;
  for (let attempt = 0; attempt < options.pollLimit; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Merge completion requires ordered polling and guarded mutations.
    let pullRequest = await client.getPullRequest(pullNumber);
    requireTrustedHead(pullRequest, trustedHead);
    requireDefaultBase(pullRequest, defaultBranch);
    await ensureCiWorkflowRun(client, pullRequest, ciRecovery);
    const checksPassed = inspectRequiredChecks(await client.getRequiredChecks(pullRequest));

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
      const baseHead = await readBaseBranchTip(client, defaultBranch);
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
    } else if (checksPassed) {
      await requireNoUnresolvedThreads(client, pullNumber);
      await client.mergePullRequest(pullNumber, trustedHead);
    } else {
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
    ...overrides,
  };
  const repository = await client.getRepository();
  let pullRequest = await client.getPullRequest();
  validateInitialState(repository, pullRequest);
  await requireClosingIssue(client, pullRequest.number);
  pullRequest = await waitForHeadConvergence(client, {
    expectedHead: options.pushedHead ?? null,
    initialPullRequest: pullRequest,
    options,
    repository,
  });
  const ciRecovery = createCiRecovery(options);
  await requireNoUnresolvedThreads(client, pullRequest.number);

  const acceptedHead = pullRequest.headSha;
  const pullNumber = pullRequest.number;
  if (pullRequest.isDraft) {
    await client.markReady(pullNumber);
    pullRequest = await client.getPullRequest(pullNumber);
    requireTrustedHead(pullRequest, acceptedHead);
    requireDefaultBase(pullRequest, repository.defaultBranch);
    if (pullRequest.isDraft) {
      stop("ready_transition_failed", `Pull request #${pullNumber} remained a draft after the ready transition.`);
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
    repository,
  });
}

export { completePullRequest };
