// Readies the accepted pull request and starts its ci.yml run before the merge wait.
import { ensureCiWorkflowRun } from "./ci-workflow-gate.mjs";
import { stop } from "./completion-error.mjs";
import { readTrustedPullRequest, requireDefaultBase } from "./merge-gates.mjs";

async function markPullRequestReady(client, ready) {
  const { acceptedHead, defaultBranch, pullNumber } = ready;
  await client.markReady(pullNumber);
  const pullRequest = await readTrustedPullRequest(client, { defaultBranch, pullNumber, trustedHead: acceptedHead });
  if (pullRequest.isDraft) {
    stop("ready_transition_failed", `Pull request #${pullNumber} remained a draft after the ready transition.`);
  }
  return pullRequest;
}

async function prepareMerge(client, preparation) {
  const { acceptedHead, ciRecovery, defaultBranch, pullNumber, repository } = preparation;
  let { pullRequest } = preparation;
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
}

export { prepareMerge };
