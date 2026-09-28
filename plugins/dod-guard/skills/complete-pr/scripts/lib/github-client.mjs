// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local GitHub CLI from Node.
import { spawnSync } from "node:child_process";
import { normalizeRequiredChecks } from "./check-normalization.mjs";
import { CompletionError } from "./completion-error.mjs";

const GH_CHECKS_PENDING_EXIT = 8;
const HTTP_NOT_FOUND = /HTTP 404/;

function githubResponseError(endpoint, field) {
  return new CompletionError(
    "github_response_shape",
    `GitHub response for ${endpoint} must include an array ${field}.`,
  );
}

function runGh(args, acceptedExitCodes = [0]) {
  const result = spawnSync("gh", args, { encoding: "utf8", windowsHide: true });
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
  let data = null;
  if (result.stdout.trim()) {
    data = JSON.parse(result.stdout);
  }
  return { data, result };
}

function ghJsonPages(endpoint, field, commandRunner) {
  const pages = ghJsonPagesData(endpoint, commandRunner);
  return pages.flatMap((page) => (Array.isArray(page?.[field]) ? page[field] : []));
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
  if (pages.length === 0 || pages.some((page) => !Array.isArray(page))) {
    throw githubResponseError(endpoint, "an array response");
  }
  return pages.flat();
}

function ghJsonFilteredArray(endpoint, filter, commandRunner) {
  const result = commandRunner(["api", "--paginate", "--jq", filter, endpoint]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${endpoint} did not complete successfully.`);
  }
  const output = result.stdout.trim();
  if (output.length === 0) {
    return [];
  }
  try {
    return output.split(/\r?\n/).map((line) => JSON.parse(line));
  } catch (error) {
    throw new Error(`${endpoint} returned invalid JSON.`, { cause: error });
  }
}

function projectStatusName(item) {
  const statusField = item?.fields?.find((field) => field?.name === "Status" || field?.data_type === "single_select");
  const value = statusField?.value;
  return value?.name?.raw ?? value?.name?.html ?? value?.name ?? (typeof value === "string" ? value : null);
}

function encodeBranch(branchName) {
  return branchName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function listOwnedProjects(owner, commandRunner) {
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

function projectItemMatchesRepository(item, repository, issueNumber) {
  const content = item?.content;
  const itemRepository = content?.repository?.full_name ?? content?.repository?.fullName;
  const itemRepositoryUrl = content?.repository_url;
  return content?.number === issueNumber &&
    (itemRepository === repository || itemRepositoryUrl === `https://api.github.com/repos/${repository}`);
}

function readIssueProjectStatuses(repository, issueNumber, commandRunner) {
  const separator = repository.indexOf("/");
  if (separator <= 0 || separator === repository.length - 1) {
    throw new Error("Repository must be in owner/name form.");
  }
  const owner = repository.slice(0, separator);
  const { basePath, projects } = listOwnedProjects(owner, commandRunner);
  const statuses = [];

  for (const project of projects) {
    if (project?.number === undefined || project?.number === null) {
      throw githubResponseError(`${basePath}/projectsV2`, "projects with a number");
    }
    const projectPath = `${basePath}/projectsV2/${project.number}`;
    const itemsEndpoint = `${projectPath}/items?per_page=100`;
    const matchingItems = ghJsonFilteredArray(
      itemsEndpoint,
      ".[] | {id, content: {number: .content.number, repository: {full_name: .content.repository.full_name}, repository_url: .content.repository_url}}",
      commandRunner,
    )
      .filter((item) => projectItemMatchesRepository(item, repository, issueNumber));
    if (matchingItems.length === 0) {
      continue;
    }

    const fieldsEndpoint = `${projectPath}/fields?per_page=100`;
    const statusFields = ghJsonArrayPages(fieldsEndpoint, commandRunner)
      .filter((field) => field?.name?.toLowerCase() === "status");
    if (statusFields.length !== 1 || statusFields[0].id === undefined || statusFields[0].id === null) {
      throw githubResponseError(fieldsEndpoint, "exactly one Status field");
    }
    const statusFieldId = statusFields[0].id;
    for (const item of matchingItems) {
      if (item?.id === undefined || item?.id === null) {
        throw githubResponseError(itemsEndpoint, "items with numeric IDs");
      }
      const itemEndpoint = `${projectPath}/items/${item.id}?fields=${statusFieldId}`;
      const { data } = ghJson(["api", "--jq", "{fields}", itemEndpoint], [0], commandRunner);
      const status = projectStatusName(data);
      if (typeof status === "string") {
        statuses.push(status);
      }
    }
  }

  return statuses;
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

function readFallbackRequiredChecks(repository, pullRequest, commandRunner) {
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
  const checkRuns = ghJsonPages(
    `repos/${repository}/commits/${pullRequest.headSha}/check-runs?per_page=100`,
    "check_runs",
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

  markReady(pullNumber) {
    this.#commandRunner(["pr", "ready", String(pullNumber), "--repo", this.repository]);
  }

  enableRepositoryAutoMerge() {
    this.#commandRunner(["api", "--method", "PATCH", `repos/${this.repository}`, "-F", "allow_auto_merge=true"]);
  }

  enablePullRequestAutoMerge(pullNumber, expectedHead) {
    this.#commandRunner([
      "pr",
      "merge",
      String(pullNumber),
      "--repo",
      this.repository,
      "--auto",
      "--merge",
      "--match-head-commit",
      expectedHead,
    ]);
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
    const { data } = ghJson([
      "pr",
      "view",
      String(pullNumber),
      "--repo",
      this.repository,
      "--json",
      "closingIssuesReferences",
    ], [0], this.#commandRunner);
    return data.closingIssuesReferences.map((issue) => {
      const issueRepository = `${issue.repository.owner.login}/${issue.repository.name}`;
      const { data: currentIssue } = ghJson(
        ["api", `repos/${issueRepository}/issues/${issue.number}`],
        [0],
        this.#commandRunner,
      );
      return {
        number: issue.number,
        state: currentIssue.state.toUpperCase(),
        url: issue.url,
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
    return { sha: data.object.sha };
  }

  deleteBranchRef(branchName) {
    const encodedBranch = encodeBranch(branchName);
    this.#commandRunner(["api", "--method", "DELETE", `repos/${this.repository}/git/refs/heads/${encodedBranch}`]);
  }

  async wait(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
