import { dispatchCiWorkflow, readCiWorkflowRuns } from "./ci-workflow.mjs";
import { runGh } from "./gh-runner.mjs";
import { deleteBranchRef, readBranchRef, readCommit } from "./git-refs.mjs";
import { readLinkedIssues } from "./linked-issues.mjs";
import { readIssueProjectStatuses } from "./project-reads.mjs";
import { markReady, mergePullRequest, readPullRequest, readPullRequestRefs, updateBranch } from "./pull-requests.mjs";
import { enableRepositoryAutoMerge, readRepository } from "./repository.mjs";
import { readRequiredChecks } from "./required-checks.mjs";
import { readUnresolvedReviewThreads } from "./review-threads.mjs";

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
    return readCommit(this.repository, sha, this.#commandRunner);
  }

  getLinkedIssues(pullNumber) {
    return readLinkedIssues(this.repository, pullNumber, this.#commandRunner);
  }

  getIssueProjectStatuses(issueNumber) {
    return readIssueProjectStatuses(this.repository, issueNumber, this.#commandRunner);
  }

  getBranchRef(branchName) {
    return readBranchRef(this.repository, branchName, this.#commandRunner);
  }

  getSourceBranchRef(branchName) {
    return this.getBranchRef(branchName);
  }

  getBaseBranchRef(branchName) {
    return this.getBranchRef(branchName);
  }

  deleteBranchRef(branchName) {
    deleteBranchRef(this.repository, branchName, this.#commandRunner);
  }

  async wait(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
