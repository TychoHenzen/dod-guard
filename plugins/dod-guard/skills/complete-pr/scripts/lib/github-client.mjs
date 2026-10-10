// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local GitHub CLI from Node.
import { spawnSync } from "node:child_process";
import { normalizeRequiredChecks } from "./check-normalization.mjs";
import { CompletionError } from "./completion-error.mjs";

const GH_CHECKS_PENDING_EXIT = 8;
// One REST page of Project items reaches about 3.5 MB on the live Project, far past Node's 1 MiB default.
const GH_OUTPUT_MAX_BUFFER = 64 * 1024 * 1024;
const HTTP_NOT_FOUND = /HTTP 404/;
const HTTP_TRANSIENT_SERVER_ERROR = /HTTP 5\d{2}/;
const CLOSING_REFERENCE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(?<number>\d+)\b/giu;
const JSON_LINE_SEPARATOR = /\r?\n/u;
const PULL_REQUEST_REF_KINDS = new Set(["head", "merge"]);
const PROJECT_REPOSITORY_IDENTITY_KEYS = ["full_name", "fullName"];
const PROJECT_ITEM_IDENTITY_JQ = ".[] | {id: .id, node_id: .node_id, content: {number: .content.number, repository: {full_name: .content.repository.full_name, fullName: .content.repository.fullName}, repository_url: .content.repository_url}}";
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
    isPlainObject(reviewThreads) &&
    Array.isArray(reviewThreads.nodes) &&
    isPlainObject(reviewThreads.pageInfo);
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

function githubResponseError(endpoint, field) {
  return new CompletionError(
    "github_response_shape",
    `GitHub response for ${endpoint} must include an array ${field}.`,
  );
}

function githubResponseContractError(endpoint, detail) {
  return new CompletionError(
    "github_response_shape",
    `GitHub response for ${endpoint} must include ${detail}.`,
  );
}

export function runGh(args, acceptedExitCodes = [0]) {
  const result = spawnSync("gh", args, { encoding: "utf8", windowsHide: true, maxBuffer: GH_OUTPUT_MAX_BUFFER });
  if (result.error) {
    throw result.error;
  }
  if (!acceptedExitCodes.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || `gh exited with ${result.status}`;
    throw new Error(detail);
  }
  return result;
}

function ghJson(args, acceptedExitCodes = [0], commandRunner = runGh) {
  const result = commandRunner(args, acceptedExitCodes);
  if (!acceptedExitCodes.includes(result.status)) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`);
  }
  let data = null;
  if (result.stdout.trim()) {
    data = JSON.parse(result.stdout);
  }
  return { data, result };
}

function ghJsonLines(endpoint, filter, commandRunner) {
  const result = commandRunner(["api", "--paginate", "--jq", filter, endpoint], [0]);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`);
  }
  const lines = String(result.stdout ?? "")
    .split(JSON_LINE_SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw githubResponseContractError(endpoint, "newline-delimited JSON Project items");
  }
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

function ghJsonPagesRequired(endpoint, field, commandRunner) {
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

function ghJsonPagesData(endpoint, commandRunner) {
  const { data } = ghJson(["api", "--paginate", "--slurp", endpoint], [0], commandRunner);
  return Array.isArray(data) ? data : [data];
}

function ghJsonArrayPages(endpoint, commandRunner) {
  const pages = ghJsonPagesData(endpoint, commandRunner);
  if (pages.some((page) => !Array.isArray(page))) {
    throw githubResponseError(endpoint, "an array response");
  }
  return pages.flat();
}

function projectStatusName(item, statusFieldId, endpoint) {
  if (!Array.isArray(item?.fields) || item.fields.length !== 1) {
    throw githubResponseContractError(endpoint, "exactly one Status field/value");
  }
  const [statusField] = item.fields;
  if (String(statusField?.id ?? "") !== String(statusFieldId) ||
      typeof statusField?.name !== "string" || statusField.name.toLowerCase() !== "status") {
    throw githubResponseContractError(endpoint, "exactly one Status field/value");
  }

  const value = statusField.value;
  const names = [];
  if (typeof value === "string") {
    names.push(value);
  } else if (value?.name && typeof value.name === "object") {
    for (const key of ["raw", "html"]) {
      if (key in value.name) {
        names.push(value.name[key]);
      }
    }
  } else if (value && typeof value.name === "string") {
    names.push(value.name);
  }

  if (names.length === 0 || names.some((name) => typeof name !== "string" || name.trim().length === 0)) {
    throw githubResponseContractError(endpoint, "exactly one non-blank Status field/value");
  }
  if (new Set(names).size !== 1) {
    throw githubResponseContractError(endpoint, "one non-contradictory Status field/value");
  }
  return names[0];
}

function readExactHeadCheckRuns(endpoint, commandRunner) {
  try {
    return ghJsonPages(endpoint, "check_runs", commandRunner);
  } catch (error) {
    if (!HTTP_TRANSIENT_SERVER_ERROR.test(errorMessage(error))) {
      throw error;
    }
    return ghJsonPages(endpoint, "check_runs", commandRunner);
  }
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

export function listOwnedProjects(owner, commandRunner) {
  const userEndpoint = `users/${owner}/projectsV2?per_page=100`;
  const userResponse = ghJson(
    ["api", "--paginate", "--slurp", userEndpoint],
    [0, 1],
    commandRunner,
  );
  if (userResponse.result.status === 0) {
    const pages = userResponse.data;
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
      throw githubResponseError(userEndpoint, "an array response");
    }
    return { basePath: `users/${owner}`, projects: pages.flat() };
  }
  if (!HTTP_NOT_FOUND.test(userResponse.result.stderr)) {
    throw new Error(userResponse.result.stderr.trim() || "Failed to list user-owned Projects.");
  }
  const orgEndpoint = `orgs/${owner}/projectsV2?per_page=100`;
  return {
    basePath: `orgs/${owner}`,
    projects: ghJsonArrayPages(orgEndpoint, commandRunner),
  };
}

function repositoryName(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function projectItemRepository(item, endpoint) {
  const content = item?.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw githubResponseContractError(endpoint, "Project items with content identity");
  }
  const repository = content.repository;
  if (!repository || typeof repository !== "object" || Array.isArray(repository)) {
    throw githubResponseContractError(endpoint, "Project items with repository identity");
  }
  const url = content.repository_url;
  const identities = [];
  for (const key of PROJECT_REPOSITORY_IDENTITY_KEYS) {
    const fullName = repository[key];
    if (fullName !== undefined && fullName !== null) {
      const normalized = repositoryName(fullName);
      if (normalized === null) {
        throw githubResponseContractError(endpoint, "a non-blank repository identity");
      }
      identities.push(normalized);
    }
  }
  if (url !== undefined && url !== null) {
    const match = typeof url === "string" && url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/i);
    if (!match) {
      throw githubResponseContractError(endpoint, "a canonical repository URL");
    }
    identities.push(repositoryName(match[1]));
  }
  if (identities.length === 0) {
    throw githubResponseContractError(endpoint, "a non-blank repository identity");
  }
  if (new Set(identities).size > 1) {
    throw githubResponseContractError(endpoint, "one non-contradictory repository identity");
  }
  return identities[0];
}

function projectItemIssueNumber(item, endpoint) {
  const value = item?.content?.number;
  const number = Number(value);
  if (value === undefined || value === null || !Number.isInteger(number) || number <= 0) {
    throw githubResponseContractError(endpoint, "a valid issue number");
  }
  return number;
}

function projectItemId(item, endpoint) {
  const id = item?.id;
  if (id === undefined || id === null || String(id).trim().length === 0) {
    throw githubResponseError(endpoint, "items with IDs");
  }
  return String(id);
}

function projectItemsForRead(endpoint, commandRunner) {
  const items = ghJsonLines(endpoint, PROJECT_ITEM_IDENTITY_JQ, commandRunner);
  const seenIds = new Set();
  const seenNodeIds = new Set();
  const seenMembership = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw githubResponseContractError(endpoint, "object Project items");
    }
    const id = projectItemId(item, endpoint);
    const nodeId = item.node_id ?? item.nodeId;
    if (nodeId === undefined || nodeId === null || String(nodeId).trim().length === 0) {
      throw githubResponseError(endpoint, "items with global IDs");
    }
    if (seenIds.has(id) || seenNodeIds.has(String(nodeId))) {
      throw githubResponseContractError(endpoint, "unique Project items");
    }
    seenIds.add(id);
    seenNodeIds.add(String(nodeId));
    const itemRepository = projectItemRepository(item, endpoint);
    const number = projectItemIssueNumber(item, endpoint);
    const membership = `${itemRepository}#${number}`;
    if (seenMembership.has(membership)) {
      throw githubResponseContractError(endpoint, "unique repository issue membership; exactly one matching issue item");
    }
    seenMembership.add(membership);
  }
  return items;
}

function projectItemMatchesRepository(item, repository, issueNumber, endpoint) {
  const number = projectItemIssueNumber(item, endpoint);
  const itemRepository = projectItemRepository(item, endpoint);
  return number === issueNumber && itemRepository === repositoryName(repository);
}

function validateProjectItemReadback(item, expectedItem, repository, issueNumber, endpoint) {
  const expectedId = projectItemId(expectedItem, endpoint);
  const actualId = projectItemId(item, endpoint);
  const expectedNodeId = String(expectedItem.node_id ?? expectedItem.nodeId ?? "");
  const actualNodeId = String(item?.node_id ?? item?.nodeId ?? "");
  if (expectedNodeId.length === 0 || actualNodeId.length === 0 || expectedId !== actualId || expectedNodeId !== actualNodeId) {
    throw githubResponseContractError(endpoint, "the same Project item IDs as the membership read");
  }
  if (!projectItemMatchesRepository(item, repository, issueNumber, endpoint)) {
    throw githubResponseContractError(endpoint, "the same repository and issue identity as the membership read");
  }
}

function readIssueProjectStatuses(repository, issueNumber, commandRunner) {
  const separator = repository.indexOf("/");
  if (separator <= 0 || separator === repository.length - 1) {
    throw new Error("Repository must be in owner/name form.");
  }
  const owner = repository.slice(0, separator);
  const { basePath, projects } = listOwnedProjects(owner, commandRunner);
  const linkedProjects = [];

  for (const project of projects) {
    if (project?.number === undefined || project?.number === null) {
      throw githubResponseError(`${basePath}/projectsV2`, "projects with a number");
    }
    if (typeof project?.state !== "string" || project.state.trim().length === 0) {
      throw githubResponseContractError(`${basePath}/projectsV2`, "projects with an explicit state");
    }
    if (project.state.trim().toLowerCase() !== "open") {
      continue;
    }
    const projectPath = `${basePath}/projectsV2/${project.number}`;
    const itemsEndpoint = `${projectPath}/items?per_page=100`;
    const matchingItems = projectItemsForRead(itemsEndpoint, commandRunner)
      .filter((item) => projectItemMatchesRepository(item, repository, issueNumber, itemsEndpoint));
    if (matchingItems.length === 0) {
      continue;
    }
    if (matchingItems.length !== 1) {
      throw githubResponseContractError(itemsEndpoint, "exactly one matching issue item");
    }
    linkedProjects.push({ project, item: matchingItems[0] });
  }

  if (linkedProjects.length !== 1) {
    throw githubResponseContractError(`${basePath}/projectsV2`, "exactly one open linked Project");
  }

  const { project, item } = linkedProjects[0];
  const projectPath = `${basePath}/projectsV2/${project.number}`;
  const fieldsEndpoint = `${projectPath}/fields?per_page=100`;
  const statusFields = ghJsonArrayPages(fieldsEndpoint, commandRunner)
    .filter((field) => typeof field?.name === "string" && field.name.toLowerCase() === "status");
  if (statusFields.length !== 1 || statusFields[0].id === undefined || statusFields[0].id === null) {
    throw githubResponseError(fieldsEndpoint, "exactly one Status field");
  }
  const statusFieldId = statusFields[0].id;
  projectItemId(item, `${projectPath}/items?per_page=100`);

  const itemEndpoint = `${projectPath}/items/${item.id}?fields=${statusFieldId}`;
  const { data } = ghJson(["api", itemEndpoint], [0], commandRunner);
  validateProjectItemReadback(data, item, repository, issueNumber, itemEndpoint);
  return [projectStatusName(data, statusFieldId, itemEndpoint)];
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

export function readFallbackRequiredChecks(repository, pullRequest, commandRunner) {
  const branch = encodeBranch(pullRequest.baseBranch);
  const protectionResponse = ghJson(
    ["api", `repos/${repository}/branches/${branch}/protection/required_status_checks`],
    [0, 1],
    commandRunner,
  );
  if (protectionResponse.result.status === 1 && HTTP_NOT_FOUND.test(protectionResponse.result.stderr)) {
    return [];
  }
  const protection = protectionResponse.data ?? {};
  const checkRuns = readExactHeadCheckRuns(
    `repos/${repository}/commits/${pullRequest.headSha}/check-runs?per_page=100`,
    commandRunner,
  );
  const statusPages = ghJsonPagesData(
    `repos/${repository}/commits/${pullRequest.headSha}/status?per_page=100`,
    commandRunner,
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
    return normalizePullRequestRefs(
      data,
      pullNumber,
      pullRequestRefsEndpoint(this.repository, pullNumber),
    );
  }

  markReady(pullNumber) {
    const pullEndpoint = `repos/${this.repository}/pulls/${pullNumber}`;
    const { data: pullRequest } = ghJson(["api", pullEndpoint], [0], this.#commandRunner);
    if (typeof pullRequest?.node_id !== "string" || pullRequest.node_id.trim().length === 0) {
      throw githubResponseContractError(pullEndpoint, "a pull request node ID");
    }

    const { data } = ghJson([
      "api",
      "graphql",
      "-f",
      `query=${READY_MUTATION}`,
      "-F",
      `pullRequestId=${pullRequest.node_id}`,
    ], [0], this.#commandRunner);
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
      ({ data } = ghJson([
        "api",
        "--method",
        "PUT",
        `repos/${this.repository}/pulls/${pullNumber}/merge`,
        "-f",
        `sha=${expectedHead}`,
        "-f",
        "merge_method=merge",
      ], [0], this.#commandRunner));
    } catch (error) {
      return readMergeAfterFailure(this, pullNumber, expectedHead, error);
    }

    if (data?.merged !== true) {
      const message = data?.message ?? `Pull request #${pullNumber} was not merged.`;
      throw new CompletionError("merge_failed", message);
    }
    return data;
  }

  getRequiredChecks(pullNumber, pullRequest) {
    const { data } = ghJson(
      [
        "pr",
        "checks",
        String(pullNumber),
        "--repo",
        this.repository,
        "--required",
        "--json",
        "bucket,name,state",
      ],
      [0, GH_CHECKS_PENDING_EXIT],
      this.#commandRunner,
    );
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }

    return readFallbackRequiredChecks(
      this.repository,
      pullRequest ?? this.getPullRequest(pullNumber),
      this.#commandRunner,
    );
  }

  getCiWorkflowRuns(headSha) {
    const workflowRunsPath =
      `repos/${this.repository}/actions/` + "workflows/ci.yml/runs";
    const query = `?head_sha=${encodeURIComponent(headSha)}&per_page=100`;
    return ghJsonPagesRequired(
      `${workflowRunsPath}${query}`,
      "workflow_runs",
      this.#commandRunner,
    );
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
        if (!references.some((candidate) => candidate.repository === reference.repository && candidate.number === reference.number)) {
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
