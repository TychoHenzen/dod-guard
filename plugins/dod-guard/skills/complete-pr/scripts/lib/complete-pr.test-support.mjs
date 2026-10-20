// Fixtures shared by the complete-pr orchestration tests: the GitHub client double and its helpers.
import { GitHubClient } from "./github-client.mjs";
import { headShaField, workflowRun } from "./github-client.test-support.mjs";

export const pendingChecks = [{ bucket: "pending", name: "build-test", state: "IN_PROGRESS" }];
export const passingChecks = [{ bucket: "pass", name: "build-test", state: "SUCCESS" }];
export const requiredCheckNames = ["build-test", "plugin-config", "static-analysis", "package-integrity"];
export const mutationCallNames = ["markReady", "enableRepositoryAutoMerge", "dispatch", "mergePullRequest"];
export const protectionEndpoint = "repos/owner/repo/branches/master/protection/required_status_checks";

export const immediateOptions = {
  ciRunPollLimit: 2,
  issuePollLimit: 2,
  pollLimit: 8,
  pollMs: 0,
  updatePollLimit: 2,
};

// Inputs that make the shared repository and pull request gates stop, with the code they stop on.
export const sequenceCases = [
  ["cross_repository_head", { pullOverrides: { isCrossRepository: true } }],
  ["wrong_base_branch", { pullOverrides: { baseBranch: "release" } }],
  ["default_branch_head", { pullOverrides: { headBranch: "master" } }],
  ["missing_permission", { repository: { canPush: false } }],
];

export function pull(overrides = {}) {
  return {
    baseBranch: "master",
    baseSha: "base-1",
    headBranch: "codex/24-complete-pr",
    headRepository: "owner/repo",
    headSha: "head-1",
    isCrossRepository: false,
    isDraft: true,
    mergeCommitSha: null,
    mergeState: "BLOCKED",
    mergeable: "MERGEABLE",
    number: 24,
    state: "OPEN",
    ...overrides,
  };
}

export function unresolvedThread(overrides = {}) {
  return {
    author: "pr-author",
    id: "thread-1",
    outdated: false,
    path: "src/a.mjs",
    url: "https://github.com/owner/repo/pull/24#discussion_r1",
    ...overrides,
  };
}

function nextValue(values) {
  if (values.length > 1) {
    return values.shift();
  }
  return values[0];
}

// Lists the client copies, each with a fresh default, so one test never changes another's script.
const DEFAULT_LISTS = {
  checks: () => [passingChecks],
  issues: () => [[{ number: 24, state: "CLOSED", url: "issue" }]],
  projectStatuses: () => [["Done"]],
  pulls: () => [],
  refs: () => [{ sha: "head-1" }, null],
  reviewThreads: () => [[]],
};

// Lists that stay null unless a test scripts them, so the client falls back to the last pull request read.
const OPTIONAL_LISTS = ["baseRefs", "pullRefs", "sourceRefs"];

// Options a test sets to make one call fail or to replace one reader.
const PASS_THROUGH_OPTIONS = [
  "deleteBranchError",
  "enableRepositoryError",
  "projectStatusReader",
  "requiredChecksError",
  "requiredChecksReader",
  "workflowDispatchError",
];

function copyLists(options) {
  const lists = {};
  for (const [name, createDefault] of Object.entries(DEFAULT_LISTS)) {
    lists[name] = [...(options[name] ?? createDefault())];
  }
  for (const name of OPTIONAL_LISTS) {
    lists[name] = options[name] ? [...options[name]] : null;
  }
  return lists;
}

function passThrough(options) {
  return Object.fromEntries(PASS_THROUGH_OPTIONS.map((name) => [name, options[name]]));
}

export class FixtureClient {
  constructor(options = {}) {
    this.repository = options.clientRepository ?? "owner/repo";
    this.repositoryDetails = {
      autoMergeAllowed: false,
      canPush: true,
      defaultBranch: "master",
      nameWithOwner: "owner/repo",
      ...options.repository,
    };
    Object.assign(this, copyLists(options), passThrough(options));
    this.commits = options.commits ?? {};
    this.workflowRuns = options.workflowRuns ?? null;
    this.lastPullHeadSha = "head-1";
    this.lastPullBaseSha = "base-1";
    this.calls = [];
  }

  getRepository() {
    return this.repositoryDetails;
  }

  getPullRequest() {
    const value = nextValue(this.pulls);
    this.lastPullHeadSha = value.headSha;
    this.lastPullBaseSha = value.baseSha;
    this.calls.push(["getPullRequest", value.headSha, value.state]);
    return value;
  }

  markReady(number) {
    this.calls.push(["markReady", number]);
  }

  enableRepositoryAutoMerge() {
    this.calls.push(["enableRepositoryAutoMerge"]);
    if (this.enableRepositoryError) {
      throw this.enableRepositoryError;
    }
  }

  mergePullRequest(number, headSha) {
    this.calls.push(["mergePullRequest", number, headSha]);
  }

  getRequiredChecks(pullRequest) {
    this.calls.push(["getRequiredChecks"]);
    if (this.requiredChecksError) {
      throw this.requiredChecksError;
    }
    if (this.requiredChecksReader) {
      return this.requiredChecksReader(pullRequest);
    }
    return nextValue(this.checks);
  }

  getCiWorkflowRuns(headSha) {
    this.calls.push(["getCiWorkflowRuns", headSha]);
    if (!this.workflowRuns) {
      return [workflowRun(headSha)];
    }
    const runs = nextValue(this.workflowRuns);
    return typeof runs === "function" ? runs(headSha) : runs;
  }

  dispatchCiWorkflow(branchName) {
    this.calls.push(["dispatch", branchName]);
    if (this.workflowDispatchError) {
      throw this.workflowDispatchError;
    }
  }

  updateBranch(number, headSha) {
    this.calls.push(["updateBranch", number, headSha]);
  }

  getCommit(sha) {
    return this.commits[sha];
  }

  getLinkedIssues() {
    return nextValue(this.issues);
  }

  getIssueProjectStatuses(issueNumber) {
    if (this.projectStatusReader) {
      return this.projectStatusReader(issueNumber);
    }
    return nextValue(this.projectStatuses);
  }

  getBranchRef(branchName) {
    this.calls.push(["getBranchRef", branchName]);
    return nextValue(this.refs);
  }

  getSourceBranchRef(branchName) {
    this.calls.push(["getSourceBranchRef", branchName]);
    return this.sourceRefs ? nextValue(this.sourceRefs) : { sha: this.lastPullHeadSha };
  }

  // Without scripted base tips the live base branch matches the last pull request read.
  getBaseBranchRef(branchName) {
    this.calls.push(["getBaseBranchRef", branchName]);
    if (this.baseRefs) {
      return nextValue(this.baseRefs);
    }
    return { sha: this.lastPullBaseSha };
  }

  getPullRequestRefs(number) {
    this.calls.push(["getPullRequestRefs", number]);
    return this.pullRefs
      ? nextValue(this.pullRefs)
      : [{ kind: "head", ref: `refs/pull/${number}/head`, sha: this.lastPullHeadSha }];
  }

  getUnresolvedReviewThreads(number) {
    this.calls.push(["getUnresolvedReviewThreads", number]);
    const value = nextValue(this.reviewThreads);
    if (value instanceof Error) {
      throw value;
    }
    return value;
  }

  deleteBranchRef(branchName) {
    this.calls.push(["deleteBranchRef", branchName]);
    if (this.deleteBranchError) {
      throw this.deleteBranchError;
    }
  }

  wait() {
    this.calls.push(["wait"]);
  }
}

export function createFixtureLocalGit(result = { branch: "deleted", currentCheckout: "switched_to_default" }) {
  const calls = [];
  return {
    calls,
    cleanupBranch(branchName, defaultBranch, options) {
      calls.push([branchName, defaultBranch, options]);
      return result;
    },
  };
}

// Answers the REST required-check reads for head-1 and fails any other command, including gh pr checks.
function restChecksRunner({ protection, checkRuns = [] }) {
  return (args) => {
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    if (endpoint === protectionEndpoint) {
      return protection;
    }
    if (endpoint === "repos/owner/repo/commits/head-1/check-runs?per_page=100") {
      return { stderr: "", status: 0, stdout: JSON.stringify({ check_runs: checkRuns }) };
    }
    if (endpoint === "repos/owner/repo/commits/head-1/status?per_page=100") {
      return { stderr: "", status: 0, stdout: JSON.stringify({ sha: "head-1", statuses: [] }) };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
}

export function protectedRequiredChecks() {
  const checks = requiredCheckNames.map((context) => ({ app_id: 15_368, context }));
  return { stderr: "", status: 0, stdout: JSON.stringify({ checks }) };
}

// Each required check ran twice on the head, in two check suites, and passed both times.
export function twoPassingRunsPerCheck() {
  return requiredCheckNames.flatMap((name, index) =>
    [1000 + 2 * index, 1001 + 2 * index].map((id) => ({
      id,
      app: { id: 15_368 },
      conclusion: "success",
      [headShaField]: "head-1",
      name,
      status: "completed",
    })),
  );
}

// Each required check passed on the head, then failed on a later run.
export function newestRunFailsPerCheck() {
  return twoPassingRunsPerCheck().map((run) => (run.id % 2 === 1 ? { ...run, conclusion: "failure" } : run));
}

// The real REST required-check reader over restChecksRunner, for FixtureClient's requiredChecksReader option.
export function restChecksReader(responses) {
  const reader = new GitHubClient("owner/repo", 24, restChecksRunner(responses));
  return (pullRequest) => reader.getRequiredChecks(pullRequest);
}
