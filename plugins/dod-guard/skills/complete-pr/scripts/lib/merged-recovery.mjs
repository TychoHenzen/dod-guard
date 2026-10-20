// Recovers the cleanup of a pull request that already merged.
import { confirmClosedIssues } from "./closing-issue-gate.mjs";
import { stop } from "./completion-error.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";
import { inspectRequiredChecks, requireOwnRepositoryHead } from "./merge-gates.mjs";
import { cleanupTrustedBranch } from "./trusted-cleanup.mjs";

const DEFAULT_OPTIONS = {
  headPollLimit: 6,
  issuePollLimit: 6,
  pollMs: 10_000,
  dryRun: false,
};

function validateMergedRecoveryState(repository, pullRequest) {
  if (pullRequest.state !== "MERGED") {
    stop("not_merged_pull_request", "The selected pull request must already be merged.");
  }
  requireOwnRepositoryHead(repository, pullRequest);
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

function recoveryResult(pullRequest, cleanup, linkedIssues) {
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

async function recoverMergedPullRequest(client, overrides = {}) {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
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
  return recoveryResult(synchronizedPullRequest, cleanup, linkedIssues);
}

export { recoverMergedPullRequest };
