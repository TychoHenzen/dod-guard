import { normalizeRequiredChecks } from "./check-normalization.mjs";
import { CompletionError } from "./completion-error.mjs";
import {
  ghJson,
  ghJsonArrayPages,
  ghJsonPagesData,
  githubResponseContractError,
  githubResponseError,
  runGh,
} from "./gh-runner.mjs";
import { readIssueProjectStatuses } from "./project-reads.mjs";

const HTTP_NOT_FOUND = /HTTP 404/;
const HTTP_TRANSIENT_SERVER_ERROR = /HTTP 5\d{2}/;
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
const REVIEW_THREADS_QUERY = [
  "query($owner: String!, $name: String!, $number: Int!, $cursor: String) {",
  "repository(owner: $owner, name: $name) {",
  "pullRequest(number: $number) {",
  "reviewThreads(first: 100, after: $cursor) {",
  "nodes { id isResolved isOutdated path comments(first: 1) { nodes { url author { login } } } }",
  "pageInfo { hasNextPage endCursor }",
  "}",
  "}",
  "}",
  "}",
].join(" ");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unresolvedReviewThread(node) {
  const firstComment = node.comments?.nodes?.[0];
  if (typeof firstComment?.url !== "string" || firstComment.url.trim().length === 0) {
    throw new Error(`review thread ${node.id} has no first comment URL`);
  }
  return {
    author: firstComment.author?.login ?? null,
    id: node.id,
    // ASSUMPTION: a missing isOutdated is reported as false; the requirement names no fallback and
    // the merge gate never reads this field.
    outdated: node.isOutdated === true,
    path: node.path,
    url: firstComment.url,
  };
}

function reviewThreadConnection(data) {
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    throw new Error(`GraphQL response carried errors: ${JSON.stringify(data.errors)}`);
  }
  const reviewThreads = data?.data?.repository?.pullRequest?.reviewThreads;
  const hasConnection =
    isPlainObject(reviewThreads) && Array.isArray(reviewThreads.nodes) && isPlainObject(reviewThreads.pageInfo);
  if (!hasConnection) {
    throw new Error("GraphQL response has no reviewThreads object with nodes and pageInfo");
  }
  return reviewThreads;
}

function unresolvedReviewThreads(nodes) {
  const threads = [];
  for (const node of nodes) {
    if (!isPlainObject(node) || typeof node.isResolved !== "boolean") {
      throw new Error("GraphQL response has a review thread without a boolean isResolved");
    }
    if (!node.isResolved) {
      threads.push(unresolvedReviewThread(node));
    }
  }
  return threads;
}

function readReviewThreadsPage(data) {
  const { nodes, pageInfo } = reviewThreadConnection(data);
  const { endCursor, hasNextPage } = pageInfo;
  // ASSUMPTION: a non-boolean hasNextPage is malformed, because "read until hasNextPage is false" does not
  // cover a missing value and reading it as the last page would fail open.
  if (typeof hasNextPage !== "boolean") {
    throw new Error("GraphQL response pageInfo.hasNextPage is not a boolean");
  }
  return { endCursor, hasNextPage, threads: unresolvedReviewThreads(nodes) };
}

function reviewThreadsArgs(repository, pullNumber, cursor) {
  const [owner, name] = repository.split("/");
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${REVIEW_THREADS_QUERY}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `name=${name}`,
    "-F",
    `number=${pullNumber}`,
  ];
  if (cursor !== null) {
    args.push("-f", `cursor=${cursor}`);
  }
  return args;
}

function readUnresolvedReviewThreads(commandRunner, repository, pullNumber) {
  const threads = [];
  const usedCursors = new Set();
  let cursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const { data } = ghJson(reviewThreadsArgs(repository, pullNumber, cursor), [0], commandRunner);
    const { endCursor, hasNextPage: morePages, threads: pageThreads } = readReviewThreadsPage(data);
    threads.push(...pageThreads);
    hasNextPage = morePages;
    if (hasNextPage) {
      if (typeof endCursor !== "string" || endCursor.length === 0 || usedCursors.has(endCursor)) {
        throw new Error("pagination is incomplete: hasNextPage is true without a new endCursor");
      }
      usedCursors.add(endCursor);
      cursor = endCursor;
    }
  }
  return threads;
}

function ghJsonPages(endpoint, field, commandRunner) {
  const pages = ghJsonPagesData(endpoint, commandRunner);
  if (pages.length === 0) {
    throw githubResponseError(endpoint, field);
  }
  return pages.flatMap((page) => {
    if (!page || typeof page !== "object" || !Array.isArray(page[field])) {
      throw githubResponseError(endpoint, field);
    }
    return page[field];
  });
}

// gh reports only the HTTP status of a failed read, so the endpoint is added here. A response-shape
// error already names its endpoint and keeps its code.
function readNamed(description, endpoint, read) {
  try {
    return read();
  } catch (error) {
    if (error instanceof CompletionError) {
      throw error;
    }
    throw new Error(`Failed to read ${description} at ${endpoint}: ${errorMessage(error)}`, { cause: error });
  }
}

function readExactHeadCheckRuns(endpoint, commandRunner) {
  return readNamed("exact-head check runs", endpoint, () => {
    try {
      return ghJsonPages(endpoint, "check_runs", commandRunner);
    } catch (error) {
      if (!HTTP_TRANSIENT_SERVER_ERROR.test(errorMessage(error))) {
        throw error;
      }
      return ghJsonPages(endpoint, "check_runs", commandRunner);
    }
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

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

function encodeBranch(branchName) {
  return branchName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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

export function readRequiredChecks(repository, pullRequest, commandRunner) {
  const branch = encodeBranch(pullRequest.baseBranch);
  const protectionEndpoint = `repos/${repository}/branches/${branch}/protection/required_status_checks`;
  const protectionResponse = readNamed("branch protection", protectionEndpoint, () =>
    ghJson(["api", protectionEndpoint], [0, 1], commandRunner),
  );
  if (protectionResponse.result.status === 1 && HTTP_NOT_FOUND.test(protectionResponse.result.stderr)) {
    return [];
  }
  if (protectionResponse.result.status !== 0) {
    const { result } = protectionResponse;
    const detail = result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`;
    throw new Error(`Failed to read branch protection at ${protectionEndpoint}: ${detail}`);
  }
  const protection = protectionResponse.data ?? {};
  const checkRuns = readExactHeadCheckRuns(
    `repos/${repository}/commits/${pullRequest.headSha}/check-runs?per_page=100`,
    commandRunner,
  );
  const statusEndpoint = `repos/${repository}/commits/${pullRequest.headSha}/status?per_page=100`;
  const statusPages = readNamed("commit statuses", statusEndpoint, () =>
    ghJsonPagesData(statusEndpoint, commandRunner),
  );
  const statusSha = statusPages.map((page) => page?.sha).find(Boolean) ?? null;
  const statuses = statusPages.flatMap((page) =>
    (Array.isArray(page?.statuses) ? page.statuses : []).map((status) => ({
      ...status,
      sha: status.sha ?? statusSha,
    })),
  );
  return normalizeRequiredChecks(protection, checkRuns, statuses, pullRequest.headSha);
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
    if (result.status === 1 && HTTP_NOT_FOUND.test(result.stderr)) {
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
    try {
      return readUnresolvedReviewThreads(this.#commandRunner, this.repository, pullNumber);
    } catch (error) {
      if (error instanceof CompletionError && error.code === "review-threads-unavailable") {
        throw error;
      }
      throw new CompletionError(
        "review-threads-unavailable",
        `Review threads for pull request #${pullNumber} could not be read: ${errorMessage(error)}`,
        { cause: error },
      );
    }
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
    if (result.status === 1 && HTTP_NOT_FOUND.test(result.stderr)) {
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

  deleteBranchRef(branchName) {
    const encodedBranch = encodeBranch(branchName);
    this.#commandRunner(["api", "--method", "DELETE", `repos/${this.repository}/git/refs/heads/${encodedBranch}`]);
  }

  async wait(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
