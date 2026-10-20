// Gates that stop /complete-pr before it mutates or merges a pull request.
import { stop } from "./completion-error.mjs";

const FAILED_CHECK_BUCKETS = new Set(["cancel", "fail"]);
const PASSING_CHECK_BUCKETS = new Set(["pass", "skipping"]);

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

  const unknown = checks.filter((check) => !PASSING_CHECK_BUCKETS.has(check.bucket) && check.bucket !== "pending");
  if (unknown.length > 0) {
    const summary = unknown.map((check) => `${check.name}=${check.state ?? check.bucket}`).join(", ");
    stop("unknown_check_state", `Required checks returned unsupported states: ${summary}.`);
  }

  return checks.every((check) => PASSING_CHECK_BUCKETS.has(check.bucket));
}

function validateInitialState(repository, pullRequest) {
  if (pullRequest.state !== "OPEN") {
    stop("not_open_pull_request", "The selected pull request must be open.");
  }
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
}

function requireDefaultBase(pullRequest, defaultBranch) {
  if (pullRequest.baseBranch !== defaultBranch) {
    stop("wrong_base_branch", `The pull request must target ${defaultBranch}.`);
  }
}

// Stop before mutating a pull request that branch protection will refuse to merge while review threads are open.
async function requireNoUnresolvedThreads(client, pullNumber) {
  const threads = await client.getUnresolvedReviewThreads(pullNumber);
  if (threads.length > 0) {
    const lines = threads.map((thread) => `- ${thread.url} ${thread.path}`);
    stop(
      "unresolved-review-threads",
      [
        `Pull request #${pullNumber} has ${threads.length} unresolved review thread(s), ` +
          "and each must be fixed with /fix-pr-review or resolved before rerunning /complete-pr.",
        ...lines,
      ].join("\n"),
    );
  }
}

export {
  inspectRequiredChecks,
  requireDefaultBase,
  requireNoUnresolvedThreads,
  requireTrustedHead,
  validateInitialState,
};
