// Recovers the cleanup of a pull request that already merged.
import { confirmClosedIssues } from "./closing-issue-gate.mjs";
import { stop } from "./completion-error.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";
import { inspectRequiredChecks } from "./merge-gates.mjs";
import { cleanupTrustedBranch } from "./trusted-cleanup.mjs";

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
  const synchronizedPullRequest = await waitForHeadConvergence(client, {
    allowMerged: true,
    initialPullRequest: pullRequest,
    options,
    repository,
  });

  const checksPassed = inspectRequiredChecks(await client.getRequiredChecks(synchronizedPullRequest));
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

export { recoverMergedPullRequest };
