// Pull requests of one repository: read, refs, ready, merge, and base update.
import { CompletionError } from "./completion-error.mjs";
import {
  errorMessage,
  ghJson,
  githubResponseContractError,
  githubResponseError,
  isHttpNotFound,
} from "./gh-runner.mjs";

const PULL_REQUEST_REF_KINDS = new Set(["head", "merge"]);

const READY_MUTATION = [
  "mutation($pullRequestId: ID!) {",
  "markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {",
  "pullRequest { isDraft }",
  "}",
  "}",
].join(" ");

function readMergeAfterFailure(repository, pullNumber, expectedHead, error, commandRunner) {
  let pullRequest;
  try {
    pullRequest = readPullRequest(repository, pullNumber, commandRunner);
  } catch (readError) {
    throw new CompletionError(
      "merge_ambiguous",
      `Merge failed (${errorMessage(error)}); pull request readback failed (${errorMessage(readError)}).`,
      { cause: readError },
    );
  }
  if (pullRequest.state === "MERGED") {
    if (pullRequest.headSha !== expectedHead) {
      throw new CompletionError(
        "unexpected_head_change",
        `Pull request head changed from ${expectedHead} to ${pullRequest.headSha}.`,
        { cause: error },
      );
    }
    return { merged: true, sha: pullRequest.mergeCommitSha };
  }
  throw error;
}

function normalizePullRequestRefs(data, pullNumber, endpoint) {
  if (!Array.isArray(data)) {
    throw githubResponseError(endpoint, "an array of pull-request refs");
  }

  const prefix = `refs/pull/${pullNumber}/`;
  const seen = new Set();
  return data.map((ref) => {
    if (!ref || typeof ref.ref !== "string" || !ref.ref.startsWith(prefix)) {
      throw githubResponseContractError(endpoint, "well-formed pull-request refs");
    }
    const kind = ref.ref.slice(prefix.length);
    if (!PULL_REQUEST_REF_KINDS.has(kind)) {
      throw githubResponseContractError(endpoint, "only head and merge pull-request refs");
    }
    if (seen.has(ref.ref)) {
      throw githubResponseContractError(endpoint, "unique pull-request refs");
    }
    seen.add(ref.ref);
    const sha = ref.object?.sha;
    if (typeof sha !== "string" || sha.trim().length === 0) {
      throw githubResponseContractError(endpoint, "pull-request refs with commit SHAs");
    }
    return { kind, ref: ref.ref, sha };
  });
}

function pullRequestRefsEndpoint(repository, pullNumber) {
  return `repos/${repository}/git/matching-refs/pull/${pullNumber}/`;
}

function mergeableName(mergeable) {
  if (mergeable === true) {
    return "MERGEABLE";
  }
  return mergeable === false ? "CONFLICTING" : "UNKNOWN";
}

function pullRequestState(data) {
  if (data.merged_at) {
    return "MERGED";
  }
  return data.state?.toUpperCase() ?? null;
}

export function normalizePullRequest(data, repository) {
  const headRepository = data.head?.repo?.full_name ?? null;

  return {
    baseBranch: data.base?.ref ?? null,
    baseSha: data.base?.sha ?? null,
    headBranch: data.head?.ref ?? null,
    headRepository,
    headSha: data.head?.sha ?? null,
    isCrossRepository: headRepository !== repository,
    isDraft: data.draft === true,
    mergeCommitSha: data.merge_commit_sha ?? null,
    mergeState: data.mergeable_state?.toUpperCase() ?? null,
    mergeable: mergeableName(data.mergeable),
    number: data.number,
    state: pullRequestState(data),
    url: data.html_url ?? null,
  };
}

export function readPullRequest(repository, pullNumber, commandRunner) {
  const { data } = ghJson(["api", `repos/${repository}/pulls/${pullNumber}`], [0], commandRunner);
  return normalizePullRequest(data, repository);
}

export function readPullRequestRefs(repository, pullNumber, commandRunner) {
  const { data, result } = ghJson(["api", pullRequestRefsEndpoint(repository, pullNumber)], [0, 1], commandRunner);
  if (isHttpNotFound(result)) {
    return [];
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Failed to read pull-request refs.");
  }
  return normalizePullRequestRefs(data, pullNumber, pullRequestRefsEndpoint(repository, pullNumber));
}

export function markReady(repository, pullNumber, commandRunner) {
  const pullEndpoint = `repos/${repository}/pulls/${pullNumber}`;
  const { data: pullRequest } = ghJson(["api", pullEndpoint], [0], commandRunner);
  if (typeof pullRequest?.node_id !== "string" || pullRequest.node_id.trim().length === 0) {
    throw githubResponseContractError(pullEndpoint, "a pull request node ID");
  }

  const { data } = ghJson(
    ["api", "graphql", "-f", `query=${READY_MUTATION}`, "-F", `pullRequestId=${pullRequest.node_id}`],
    [0],
    commandRunner,
  );
  if (data?.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false) {
    throw new CompletionError(
      "ready_transition_failed",
      `Pull request #${pullNumber} remained a draft after the ready transition.`,
    );
  }
}

export function mergePullRequest(repository, pullNumber, expectedHead, commandRunner) {
  let data;
  try {
    ({ data } = ghJson(
      [
        "api",
        "--method",
        "PUT",
        `repos/${repository}/pulls/${pullNumber}/merge`,
        "-f",
        `sha=${expectedHead}`,
        "-f",
        "merge_method=merge",
      ],
      [0],
      commandRunner,
    ));
  } catch (error) {
    return readMergeAfterFailure(repository, pullNumber, expectedHead, error, commandRunner);
  }

  if (data?.merged !== true) {
    const message = data?.message ?? `Pull request #${pullNumber} was not merged.`;
    throw new CompletionError("merge_failed", message);
  }
  return data;
}

export function updateBranch(repository, pullNumber, expectedHead, commandRunner) {
  commandRunner([
    "api",
    "--method",
    "PUT",
    `repos/${repository}/pulls/${pullNumber}/update-branch`,
    "-f",
    `expected_head_sha=${expectedHead}`,
  ]);
}
