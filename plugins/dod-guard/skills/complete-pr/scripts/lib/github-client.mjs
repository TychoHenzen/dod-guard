import { dispatchCiWorkflow, readCiWorkflowRuns } from "./ci-workflow.mjs";
import { ghJson, ghJsonArrayPages, githubResponseContractError, isHttpNotFound, runGh } from "./gh-runner.mjs";
import { encodeBranch } from "./git-refs.mjs";
import { readIssueProjectStatuses } from "./project-reads.mjs";
import { markReady, mergePullRequest, readPullRequest, readPullRequestRefs, updateBranch } from "./pull-requests.mjs";
import { enableRepositoryAutoMerge, readRepository } from "./repository.mjs";
import { readRequiredChecks } from "./required-checks.mjs";
import { readUnresolvedReviewThreads } from "./review-threads.mjs";

const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(?<number>\d+)\b/giu;

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

export class GitHubClient {
  #commandRunner;

  constructor(repository, pullNumber, commandRunner = runGh) {
    this.repository = repository;
    this.pullNumber = pullNumber;
    this.#commandRunner = commandRunner;
  }

  getRepository() {
    return readRepository(this.repository, this.#commandRunner);
  }

  getPullRequest(pullNumber = this.pullNumber) {
    return readPullRequest(this.repository, pullNumber, this.#commandRunner);
  }

  getPullRequestRefs(pullNumber = this.pullNumber) {
    return readPullRequestRefs(this.repository, pullNumber, this.#commandRunner);
  }

  markReady(pullNumber) {
    markReady(this.repository, pullNumber, this.#commandRunner);
  }

  getUnresolvedReviewThreads(pullNumber = this.pullNumber) {
    return readUnresolvedReviewThreads(this.repository, pullNumber, this.#commandRunner);
  }

  enableRepositoryAutoMerge() {
    enableRepositoryAutoMerge(this.repository, this.#commandRunner);
  }

  mergePullRequest(pullNumber, expectedHead) {
    return mergePullRequest(this.repository, pullNumber, expectedHead, this.#commandRunner);
  }

  getRequiredChecks(pullRequest) {
    return readRequiredChecks(this.repository, pullRequest, this.#commandRunner);
  }

  getCiWorkflowRuns(headSha) {
    return readCiWorkflowRuns(this.repository, headSha, this.#commandRunner);
  }

  dispatchCiWorkflow(branchName) {
    dispatchCiWorkflow(this.repository, branchName, this.#commandRunner);
  }

  updateBranch(pullNumber, expectedHead) {
    updateBranch(this.repository, pullNumber, expectedHead, this.#commandRunner);
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
