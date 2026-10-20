import { CompletionError } from "./completion-error.mjs";
import {
  errorMessage,
  ghJson,
  ghJsonArrayPages,
  ghJsonPages,
  githubResponseContractError,
  githubResponseError,
  isHttpNotFound,
  runGh,
} from "./gh-runner.mjs";
import { encodeBranch } from "./git-refs.mjs";
import { readIssueProjectStatuses } from "./project-reads.mjs";
import { readRequiredChecks } from "./required-checks.mjs";
import { readUnresolvedReviewThreads } from "./review-threads.mjs";

const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(?<number>\d+)\b/giu;

const PULL_REQUEST_REF_KINDS = new Set(["head", "merge"]);

const READY_MUTATION = [
  "mutation($pullRequestId: ID!) {",
  "markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {",
  "pullRequest { isDraft }",
  "}",
  "}",
].join(" ");

function readMergeAfterFailure(client, pullNumber, expectedHead, error) {
  let pullRequest;
  try {
    pullRequest = client.getPullRequest(pullNumber);
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

function closingIssueReferences(text, defaultRepository) {
  const references = new Map();
  for (const match of String(text ?? "").matchAll(CLOSING_REFERENCE)) {
    const repository = match.groups.repository ?? defaultRepository;
    const number = Number(match.groups.number);
    const key = `${repository}#${number}`;
    if (!references.has(key)) {
      references.set(key, { repository, number });
    }
  }
  return [...references.values()];
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

export function normalizePullRequest(data, repository) {
  const headRepository = data.head?.repo?.full_name ?? null;
  let state = data.state?.toUpperCase() ?? null;
  if (data.merged_at) {
    state = "MERGED";
  }

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
    mergeable: data.mergeable === true ? "MERGEABLE" : data.mergeable === false ? "CONFLICTING" : "UNKNOWN",
    number: data.number,
    state,
    url: data.html_url ?? null,
  };
}

export class GitHubClient {
  #commandRunner;

  constructor(repository, pullNumber, commandRunner = runGh) {
    this.repository = repository;
    this.pullNumber = pullNumber;
    this.#commandRunner = commandRunner;
  }

  getRepository() {
    const { data } = ghJson(["api", `repos/${this.repository}`], [0], this.#commandRunner);
    return {
      autoMergeAllowed: data.allow_auto_merge === true,
      canPush: data.permissions?.push === true,
      defaultBranch: data.default_branch,
      nameWithOwner: data.full_name,
    };
  }

  getPullRequest(pullNumber = this.pullNumber) {
    const { data } = ghJson(["api", `repos/${this.repository}/pulls/${pullNumber}`], [0], this.#commandRunner);
    return normalizePullRequest(data, this.repository);
  }

  getPullRequestRefs(pullNumber = this.pullNumber) {
    const { data, result } = ghJson(
      ["api", pullRequestRefsEndpoint(this.repository, pullNumber)],
      [0, 1],
      this.#commandRunner,
    );
    if (result.status === 1 && isHttpNotFound(result)) {
      return [];
    }
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "Failed to read pull-request refs.");
    }
    return normalizePullRequestRefs(data, pullNumber, pullRequestRefsEndpoint(this.repository, pullNumber));
  }

  markReady(pullNumber) {
    const pullEndpoint = `repos/${this.repository}/pulls/${pullNumber}`;
    const { data: pullRequest } = ghJson(["api", pullEndpoint], [0], this.#commandRunner);
    if (typeof pullRequest?.node_id !== "string" || pullRequest.node_id.trim().length === 0) {
      throw githubResponseContractError(pullEndpoint, "a pull request node ID");
    }

    const { data } = ghJson(
      ["api", "graphql", "-f", `query=${READY_MUTATION}`, "-F", `pullRequestId=${pullRequest.node_id}`],
      [0],
      this.#commandRunner,
    );
    if (data?.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false) {
      throw new CompletionError(
        "ready_transition_failed",
        `Pull request #${pullNumber} remained a draft after the ready transition.`,
      );
    }
  }

  getUnresolvedReviewThreads(pullNumber = this.pullNumber) {
    return readUnresolvedReviewThreads(this.repository, pullNumber, this.#commandRunner);
  }

  enableRepositoryAutoMerge() {
    this.#commandRunner(["api", "--method", "PATCH", `repos/${this.repository}`, "-F", "allow_auto_merge=true"]);
  }

  mergePullRequest(pullNumber, expectedHead) {
    let data;
    try {
      ({ data } = ghJson(
        [
          "api",
          "--method",
          "PUT",
          `repos/${this.repository}/pulls/${pullNumber}/merge`,
          "-f",
          `sha=${expectedHead}`,
          "-f",
          "merge_method=merge",
        ],
        [0],
        this.#commandRunner,
      ));
    } catch (error) {
      return readMergeAfterFailure(this, pullNumber, expectedHead, error);
    }

    if (data?.merged !== true) {
      const message = data?.message ?? `Pull request #${pullNumber} was not merged.`;
      throw new CompletionError("merge_failed", message);
    }
    return data;
  }

  getRequiredChecks(pullRequest) {
    return readRequiredChecks(this.repository, pullRequest, this.#commandRunner);
  }

  getCiWorkflowRuns(headSha) {
    const workflowRunsPath = `repos/${this.repository}/actions/` + "workflows/ci.yml/runs";
    const query = `?head_sha=${encodeURIComponent(headSha)}&per_page=100`;
    return ghJsonPages(`${workflowRunsPath}${query}`, "workflow_runs", this.#commandRunner);
  }

  dispatchCiWorkflow(branchName) {
    this.#commandRunner([
      "api",
      "--method",
      "POST",
      `repos/${this.repository}/actions/workflows/ci.yml/dispatches`,
      "-f",
      `ref=${branchName}`,
    ]);
  }

  updateBranch(pullNumber, expectedHead) {
    this.#commandRunner([
      "api",
      "--method",
      "PUT",
      `repos/${this.repository}/pulls/${pullNumber}/update-branch`,
      "-f",
      `expected_head_sha=${expectedHead}`,
    ]);
  }

  getCommit(sha) {
    const { data } = ghJson(["api", `repos/${this.repository}/commits/${sha}`], [0], this.#commandRunner);
    return { parents: data.parents.map((parent) => parent.sha), sha: data.sha };
  }

  getLinkedIssues(pullNumber) {
    const pullEndpoint = `repos/${this.repository}/pulls/${pullNumber}`;
    const { data: pull } = ghJson(["api", pullEndpoint], [0], this.#commandRunner);
    const references = closingIssueReferences(pull?.body, this.repository);
    for (const commit of ghJsonArrayPages(`${pullEndpoint}/commits?per_page=100`, this.#commandRunner)) {
      for (const reference of closingIssueReferences(commit?.commit?.message, this.repository)) {
        if (
          !references.some(
            (candidate) => candidate.repository === reference.repository && candidate.number === reference.number,
          )
        ) {
          references.push(reference);
        }
      }
    }
    return references.map(({ repository: issueRepository, number }) => {
      const { data: currentIssue } = ghJson(
        ["api", `repos/${issueRepository}/issues/${number}`],
        [0],
        this.#commandRunner,
      );
      return {
        number,
        state: currentIssue.state.toUpperCase(),
        url: currentIssue.html_url ?? currentIssue.url,
      };
    });
  }

  getIssueProjectStatuses(issueNumber) {
    return readIssueProjectStatuses(this.repository, issueNumber, this.#commandRunner);
  }

  getBranchRef(branchName) {
    const encodedBranch = encodeBranch(branchName);
    const { data, result } = ghJson(
      ["api", `repos/${this.repository}/git/ref/heads/${encodedBranch}`],
      [0, 1],
      this.#commandRunner,
    );
    if (result.status === 1 && isHttpNotFound(result)) {
      return null;
    }
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "Failed to read remote branch ref.");
    }
    if (typeof data?.object?.sha !== "string" || data.object.sha.trim().length === 0) {
      throw githubResponseContractError(
        `repos/${this.repository}/git/ref/heads/${encodedBranch}`,
        "a branch ref with a commit SHA",
      );
    }
    return { sha: data.object.sha };
  }

  getSourceBranchRef(branchName) {
    return this.getBranchRef(branchName);
  }

  getBaseBranchRef(branchName) {
    return this.getBranchRef(branchName);
  }

  deleteBranchRef(branchName) {
    const encodedBranch = encodeBranch(branchName);
    this.#commandRunner(["api", "--method", "DELETE", `repos/${this.repository}/git/refs/heads/${encodedBranch}`]);
  }

  async wait(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
