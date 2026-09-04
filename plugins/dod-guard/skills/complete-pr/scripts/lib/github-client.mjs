// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local GitHub CLI from Node.
import { spawnSync } from "node:child_process";

const GH_CHECKS_PENDING_EXIT = 8;
const HTTP_NOT_FOUND = /HTTP 404/;

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

function ghJson(args, acceptedExitCodes = [0]) {
  const result = runGh(args, acceptedExitCodes);
  let data = null;
  if (result.stdout.trim()) {
    data = JSON.parse(result.stdout);
  }
  return { data, result };
}

function encodeBranch(branchName) {
  return branchName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export class GitHubClient {
  constructor(repository, pullNumber) {
    this.repository = repository;
    this.pullNumber = pullNumber;
  }

  getRepository() {
    const { data } = ghJson(["api", `repos/${this.repository}`]);
    return {
      autoMergeAllowed: data.allow_auto_merge === true,
      canPush: data.permissions?.push === true,
      defaultBranch: data.default_branch,
      nameWithOwner: data.full_name,
    };
  }

  getPullRequest(pullNumber = this.pullNumber) {
    const fields = [
      "baseRefName",
      "baseRefOid",
      "headRefName",
      "headRefOid",
      "headRepository",
      "isCrossRepository",
      "isDraft",
      "mergeCommit",
      "mergeStateStatus",
      "mergeable",
      "number",
      "state",
      "url",
    ].join(",");
    const { data } = ghJson([
      "pr",
      "view",
      String(pullNumber),
      "--repo",
      this.repository,
      "--json",
      fields,
    ]);
    return {
      baseBranch: data.baseRefName,
      baseSha: data.baseRefOid,
      headBranch: data.headRefName,
      headRepository: data.headRepository?.nameWithOwner,
      headSha: data.headRefOid,
      isCrossRepository: data.isCrossRepository,
      isDraft: data.isDraft,
      mergeCommitSha: data.mergeCommit?.oid ?? null,
      mergeState: data.mergeStateStatus,
      mergeable: data.mergeable,
      number: data.number,
      state: data.state,
      url: data.url,
    };
  }

  markReady(pullNumber) {
    runGh(["pr", "ready", String(pullNumber), "--repo", this.repository]);
  }

  enableRepositoryAutoMerge() {
    runGh(["api", "--method", "PATCH", `repos/${this.repository}`, "-F", "allow_auto_merge=true"]);
  }

  enablePullRequestAutoMerge(pullNumber, expectedHead) {
    runGh([
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

  getRequiredChecks(pullNumber) {
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
    );
    return data;
  }

  updateBranch(pullNumber, expectedHead) {
    runGh([
      "api",
      "--method",
      "PUT",
      `repos/${this.repository}/pulls/${pullNumber}/update-branch`,
      "-f",
      `expected_head_sha=${expectedHead}`,
    ]);
  }

  getCommit(sha) {
    const { data } = ghJson(["api", `repos/${this.repository}/commits/${sha}`]);
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
    ]);
    return data.closingIssuesReferences.map((issue) => {
      const issueRepository = `${issue.repository.owner.login}/${issue.repository.name}`;
      const { data: currentIssue } = ghJson(["api", `repos/${issueRepository}/issues/${issue.number}`]);
      return {
        number: issue.number,
        state: currentIssue.state.toUpperCase(),
        url: issue.url,
      };
    });
  }

  getBranchRef(branchName) {
    const encodedBranch = encodeBranch(branchName);
    const { data, result } = ghJson(["api", `repos/${this.repository}/git/ref/heads/${encodedBranch}`], [0, 1]);
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
    runGh(["api", "--method", "DELETE", `repos/${this.repository}/git/refs/heads/${encodedBranch}`]);
  }

  async wait(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
