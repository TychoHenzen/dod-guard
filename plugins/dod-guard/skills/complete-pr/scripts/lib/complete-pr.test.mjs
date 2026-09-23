// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest, recoverMergedPullRequest } from "./complete-pr.mjs";
import { GitHubClient, normalizePullRequest } from "./github-client.mjs";

const pendingChecks = [{ bucket: "pending", name: "build-test", state: "IN_PROGRESS" }];
const passingChecks = [{ bucket: "pass", name: "build-test", state: "SUCCESS" }];
const requiredCheckNames = ["build-test", "plugin-config", "static-analysis", "package-integrity"];
const headShaField = "head_sha";
const workflowRunsField = "workflow_runs";
const workflowRunsPattern = /workflow_runs/;
const PERMISSION_ERROR = /HTTP 403: auto-merge requires administration permission/;

function pull(overrides = {}) {
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

function workflowRun(headSha, overrides = {}) {
  return {
    conclusion: "success",
    [headShaField]: headSha,
    name: "CI",
    path: ".github/workflows/ci.yml@refs/heads/codex/24-complete-pr",
    status: "completed",
    ...overrides,
  };
}

function nextValue(values) {
  if (values.length > 1) {
    return values.shift();
  }
  return values[0];
}

class FixtureClient {
  constructor(options = {}) {
    this.repository = options.clientRepository ?? "owner/repo";
    this.repositoryDetails = {
      autoMergeAllowed: false,
      canPush: true,
      defaultBranch: "master",
      nameWithOwner: "owner/repo",
      ...options.repository,
    };
    this.pulls = [...(options.pulls ?? [])];
    this.checks = [...(options.checks ?? [passingChecks])];
    this.commits = options.commits ?? {};
    this.issues = [...(options.issues ?? [[{ number: 24, state: "CLOSED", url: "issue" }]])];
    this.projectStatuses = [...(options.projectStatuses ?? [["Done"]])];
    this.refs = [...(options.refs ?? [{ sha: "head-1" }, null])];
    this.workflowRuns = options.workflowRuns ?? null;
    this.workflowDispatchError = options.workflowDispatchError;
    this.enableRepositoryError = options.enableRepositoryError;
    this.calls = [];
  }

  getRepository() {
    return this.repositoryDetails;
  }

  getPullRequest() {
    const value = nextValue(this.pulls);
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

  enablePullRequestAutoMerge(number, headSha) {
    this.calls.push(["enablePullRequestAutoMerge", number, headSha]);
  }

  getRequiredChecks() {
    this.calls.push(["getRequiredChecks"]);
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

  getIssueProjectStatuses() {
    return nextValue(this.projectStatuses);
  }

  getBranchRef(branchName) {
    this.calls.push(["getBranchRef", branchName]);
    return nextValue(this.refs);
  }

  deleteBranchRef(branchName) {
    this.calls.push(["deleteBranchRef", branchName]);
  }

  wait() {
    this.calls.push(["wait"]);
  }
}

function createFixtureLocalGit(result = { branch: "deleted", remainingWorktrees: [], worktrees: [] }) {
  const calls = [];
  return {
    calls,
    cleanupBranch(branchName, defaultBranch, options) {
      calls.push([branchName, defaultBranch, options]);
      return result;
    },
  };
}

const immediateOptions = {
  ciRunPollLimit: 2,
  issuePollLimit: 2,
  pollLimit: 8,
  pollMs: 0,
  updatePollLimit: 2,
};

test("normalizes the narrow REST pull request payload used by the completion loop", () => {
  assert.deepEqual(
    normalizePullRequest({
      base: { ref: "master", sha: "base-1" },
      draft: true,
      head: { ref: "codex/24-complete-pr", sha: "head-1", repo: { full_name: "owner/repo" } },
      html_url: "https://github.com/owner/repo/pull/24",
      merge_commit_sha: null,
      mergeable: true,
      mergeable_state: "blocked",
      number: 24,
      state: "open",
    }, "owner/repo"),
    {
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
      url: "https://github.com/owner/repo/pull/24",
    },
  );
});

test("normalizes closed REST pull requests only when merged_at is populated", () => {
  assert.equal(normalizePullRequest({ state: "closed", merged_at: "2026-09-12T13:47:19Z" }, "owner/repo").state, "MERGED");
  assert.equal(normalizePullRequest({ state: "closed", merged_at: null }, "owner/repo").state, "CLOSED");
});

test("reads linked Project statuses through the GitHub client adapter", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: '{"projectItems":[{"status":{"name":"Done"}},{"status":{}}]}' };
  });

  assert.deepEqual(client.getIssueProjectStatuses(24), ["Done"]);
  assert.deepEqual(calls, [["issue", "view", "24", "--repo", "owner/repo", "--json", "projectItems"]]);
});

test("lists ci.yml workflow runs for the trusted head SHA", () => {
  const calls = [];
  const run = workflowRun("head-1");
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ [workflowRunsField]: [run] }),
    };
  });

  assert.deepEqual(client.getCiWorkflowRuns("head-1"), [run]);
  assert.deepEqual(calls, [[
    "api",
    "--paginate",
    "--slurp",
    "repos/owner/repo/actions/workflows/ci.yml/runs?" +
      "head_sha=head-1&per_page=100",
  ]]);
});

test("rejects malformed ci.yml workflow responses", () => {
  for (const response of [{}, []]) {
    const client = new GitHubClient("owner/repo", 24, () => ({
      status: 0,
      stderr: "",
      stdout: JSON.stringify(response),
    }));

    assert.throws(() => client.getCiWorkflowRuns("head-1"), {
      code: "github_response_shape",
      name: "CompletionError",
      message: workflowRunsPattern,
    });
  }
});

test(
  "dispatches ci.yml through workflow_dispatch at the checked branch",
  () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: "" };
  });

  client.dispatchCiWorkflow("codex/24-complete-pr");

  assert.deepEqual(calls, [[
    "api",
    "--method",
    "POST",
    "repos/owner/repo/actions/workflows/ci.yml/dispatches",
    "-f",
    "ref=codex/24-complete-pr",
  ]]);
  },
);

test(
  "recovers missing ci.yml and completes after exact-head checks pass",
  async () => {
    const client = new FixtureClient({
      clientRepository: "owner/repo",
      workflowRuns: [[], [workflowRun("head-1")]],
      checks: [passingChecks],
      refs: [{ sha: "head-1" }, { sha: "head-1" }, null],
      pulls: [
        pull(),
        pull({ isDraft: false }),
        pull({ isDraft: false }),
        pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
      ],
    });

    const result = await completePullRequest(client, immediateOptions);

    assert.equal(client.repository, "owner/repo");
    assert.deepEqual(
      client.calls.filter(([name]) => name === "dispatch"),
      [["dispatch", "codex/24-complete-pr"]],
    );
    assert.deepEqual(
      client.calls.filter(([name]) => name === "getCiWorkflowRuns"),
      [
        ["getCiWorkflowRuns", "head-1"],
        ["getCiWorkflowRuns", "head-1"],
        ["getCiWorkflowRuns", "head-1"],
        ["getCiWorkflowRuns", "head-1"],
      ],
    );
    assert.deepEqual(client.calls.filter(([name]) => name === "getRequiredChecks"), [
      ["getRequiredChecks"],
    ]);
    assert.equal(result.acceptedHead, "head-1");
    assert.equal(result.mergeCommitSha, "merge-1");
    assert.equal(result.branch, "deleted");
  },
);

test("recovers an already-merged pull request through guarded remote and local cleanup", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.branch, "deleted");
  assert.equal(result.local.branch, "deleted");
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [["deleteBranchRef", "codex/24-complete-pr"]]);
});

test("dry-runs merged pull-request recovery without cleanup mutation", async () => {
  const localGit = createFixtureLocalGit({ branch: "would_delete", remainingWorktrees: [], worktrees: [] });
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, dryRun: true, localGit });

  assert.equal(result.branch, "would_delete");
  assert.equal(result.local.branch, "would_delete");
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: true }]]);
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("refuses merged recovery when a linked issue is not Done in its Project", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    projectStatuses: [[]],
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), { code: "project_not_done" });
  assert.equal(localGit.calls.length, 0);
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("waits for required checks, confirms merge, and deletes the trusted remote branch", async () => {
  const mergedState = normalizePullRequest(
    { state: "closed", merged_at: "2026-09-12T13:47:19Z" },
    "owner/repo",
  ).state;
  const client = new FixtureClient({
    checks: [pendingChecks, passingChecks],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: mergedState }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(client.calls.filter(([name]) => name === "markReady"), [["markReady", 24]]);
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [
    ["deleteBranchRef", "codex/24-complete-pr"],
  ]);
});

test("waits for all four repository required checks before trusted cleanup", async () => {
  const requiredChecks = requiredCheckNames.map((name) => ({ bucket: "pending", name, state: "IN_PROGRESS" }));
  const passingRequiredChecks = requiredCheckNames.map((name) => ({ bucket: "pass", name, state: "SUCCESS" }));
  const client = new FixtureClient({
    checks: [requiredChecks, passingRequiredChecks],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [
    ["deleteBranchRef", "codex/24-complete-pr"],
  ]);
});

test("treats skipped required checks as passing", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "skipping", name: "build-test", state: "SKIPPED" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
});

test("reports the fallback reason for unsupported required-check evidence", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /PROVIDER_MISMATCH/,
  });
});

test("stops on missing fallback evidence without merge or branch cleanup", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /MISSING/,
  });
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
  assert.equal(client.calls.some(([name]) => name === "dispatch"), false);
});

test(
  "dispatches missing ci.yml once after verifying the same-repository " +
    "branch head",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[], [workflowRun("head-1")]],
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
    ],
  });

  await assert.rejects(
    completePullRequest(client, { ...immediateOptions, ciRunPollLimit: 1 }),
    { code: "unknown_check_state" },
  );

  const dispatches = client.calls.filter(([name]) => name === "dispatch");
  assert.deepEqual(dispatches, [["dispatch", "codex/24-complete-pr"]]);
  const branchRefIndex = client.calls.findIndex(
    ([name]) => name === "getBranchRef",
  );
  const dispatchIndex = client.calls.findIndex(([name]) => name === "dispatch");
  assert.ok(branchRefIndex >= 0);
  assert.ok(branchRefIndex < dispatchIndex);
  const dispatchCall = client.calls.findIndex(([name]) => name === "dispatch");
  const requiredChecksCall = client.calls.findIndex(
    ([name]) => name === "getRequiredChecks",
  );
  assert.ok(dispatchCall < requiredChecksCall);
  },
);

test(
  "leaves a pending ci.yml run pending instead of accepting missing job checks",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [
      [workflowRun("head-1", { conclusion: null, status: "queued" })],
      [workflowRun("head-1", { conclusion: null, status: "in_progress" })],
      [workflowRun("head-1", { conclusion: null, status: "in_progress" })],
      [workflowRun("head-1")],
    ],
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
    ],
  });

  await assert.rejects(
    completePullRequest(client, { ...immediateOptions, ciRunPollLimit: 4 }),
    { code: "unknown_check_state" },
  );

  const requiredChecksCalls = client.calls.filter(
    ([name]) => name === "getRequiredChecks",
  );
  assert.equal(requiredChecksCalls.length, 1);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 3);
  assert.equal(client.calls.some(([name]) => name === "dispatch"), false);
  const autoMergeIndex = client.calls.findIndex(
    ([name]) => name === "enableRepositoryAutoMerge",
  );
  const workflowReads = client.calls
    .slice(0, autoMergeIndex)
    .filter(([name]) => name === "getCiWorkflowRuns");
  assert.equal(workflowReads.length, 4);
  },
);

test(
  "does not enable auto-merge when an exact-head ci.yml run stays pending",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[
      workflowRun("head-1", { conclusion: null, status: "in_progress" }),
    ]],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_run_timeout",
    message: /remained pending/,
  });

  const workflowReads = client.calls.filter(
    ([name]) => name === "getCiWorkflowRuns",
  );
  assert.equal(workflowReads.length, 2);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 1);
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "enablePullRequestAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "getRequiredChecks"),
    false,
  );
  },
);

test(
  "fails before auto-merge when no exact-head ci.yml run appears " +
    "after dispatch",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[], []],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_run_timeout",
    message: /head-1/,
  });
  assert.deepEqual(client.calls.filter(([name]) => name === "dispatch"), [
    ["dispatch", "codex/24-complete-pr"],
  ]);
  assert.equal(
    client.calls.some(([name]) => name === "enablePullRequestAutoMerge"),
    false,
  );
  },
);

test(
  "does not dispatch for a forked PR or a branch that moved from the " +
    "trusted head",
  async () => {
  const forked = new FixtureClient({
    pulls: [pull({ headRepository: "fork/repo", isCrossRepository: true })],
  });
  await assert.rejects(
    completePullRequest(forked, immediateOptions),
    { code: "cross_repository_head" },
  );
  assert.equal(forked.calls.some(([name]) => name === "dispatch"), false);

  const moved = new FixtureClient({
    workflowRuns: [[]],
    refs: [{ sha: "new-head" }],
    pulls: [pull(), pull({ isDraft: false })],
  });
  await assert.rejects(completePullRequest(moved, immediateOptions), {
    code: "ci_branch_head_mismatch",
    message: /head-1.*new-head/,
  });
  assert.equal(moved.calls.some(([name]) => name === "dispatch"), false);
  assert.equal(
    moved.calls.some(([name]) => name === "enablePullRequestAutoMerge"),
    false,
  );

  const missingBranch = new FixtureClient({
    workflowRuns: [[]],
    refs: [null],
    pulls: [pull(), pull({ isDraft: false })],
  });
  await assert.rejects(
    completePullRequest(missingBranch, immediateOptions),
    { code: "ci_branch_not_found" },
  );
  assert.equal(
    missingBranch.calls.some(([name]) => name === "dispatch"),
    false,
  );
  },
);

test(
  "fails closed for duplicate, stale, wrong-workflow, failed, cancelled, " +
    "and unsupported ci.yml runs",
  async () => {
  const cases = [
    {
      code: "duplicate_ci_workflow_run",
      runs: [workflowRun("head-1"), workflowRun("head-1")],
    },
    { code: "stale_ci_workflow_run", runs: [workflowRun("old-head")] },
    {
      code: "unrelated_ci_workflow_run",
      runs: [
        workflowRun("head-1", {
          path: ".github/workflows/other.yml@refs/heads/main",
        }),
      ],
    },
    {
      code: "ci_workflow_failed",
      runs: [workflowRun("head-1", { conclusion: "failure" })],
    },
    {
      code: "ci_workflow_failed",
      runs: [workflowRun("head-1", { conclusion: "cancelled" })],
    },
    {
      code: "unknown_ci_workflow_state",
      runs: [workflowRun("head-1", { status: "unexpected" })],
    },
    { code: "unknown_ci_workflow_state", runs: [null] },
  ];

  for (const { code, runs } of cases) {
    const client = new FixtureClient({
      workflowRuns: [runs],
      pulls: [pull(), pull({ isDraft: false })],
    });

    await assert.rejects(
      completePullRequest(client, immediateOptions),
      { code },
    );
    assert.equal(
      client.calls.some(([name]) => name === "enablePullRequestAutoMerge"),
      false,
    );
  }
  },
);

test(
  "reads back after an ambiguous dispatch and never dispatches twice",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [
      [],
      [workflowRun("head-1", { conclusion: null, status: "in_progress" })],
      [workflowRun("head-1")],
    ],
    workflowDispatchError: new Error("connection reset"),
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
    ],
  });

  await assert.rejects(
    completePullRequest(client, immediateOptions),
    { code: "unknown_check_state" },
  );
  assert.deepEqual(client.calls.filter(([name]) => name === "dispatch"), [
    ["dispatch", "codex/24-complete-pr"],
  ]);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 1);
  },
);

test(
  "stops after a rejected dispatch and exact-head readback finds no run",
  async () => {
  const client = new FixtureClient({
    workflowRuns: [[], []],
    workflowDispatchError: new Error(
      "HTTP 403: Actions write permission is required",
    ),
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_dispatch_failed",
    message: /HTTP 403.*no exact-head run/,
  });
  assert.equal(client.calls.filter(([name]) => name === "dispatch").length, 1);
  assert.equal(
    client.calls.some(([name]) => name === "enablePullRequestAutoMerge"),
    false,
  );
  },
);

test("rejects a pull request whose base changes before fallback verification", async () => {
  const client = new FixtureClient({
    pulls: [
      pull(),
      pull({ baseBranch: "release", isDraft: false }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "wrong_base_branch" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "enablePullRequestAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("does not run cleanup for a closed pull request without merged_at", async () => {
  const closedState = normalizePullRequest({ state: "closed", merged_at: null }, "owner/repo").state;
  const client = new FixtureClient({
    pulls: [
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, state: closedState }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "pull_request_closed" });
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("stops before auto-merge when the ready transition leaves a draft", async () => {
  const client = new FixtureClient({ pulls: [pull(), pull()] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "ready_transition_failed" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "enablePullRequestAutoMerge"), false);
});

test("stops before auto-merge when marking a draft ready fails", async () => {
  const client = new FixtureClient({ pulls: [pull()] });
  client.markReady = () => {
    throw new Error("gh pr ready failed");
  };

  await assert.rejects(completePullRequest(client, immediateOptions), { message: "gh pr ready failed" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "enablePullRequestAutoMerge"), false);
});

test("marks a draft pull request ready through GitHub CLI", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => calls.push(args));

  client.markReady(24);

  assert.deepEqual(calls, [["pr", "ready", "24", "--repo", "owner/repo"]]);
});

test("surfaces failures from the GitHub ready command", () => {
  const failure = new Error("gh pr ready failed");
  const client = new GitHubClient("owner/repo", 24, () => {
    throw failure;
  });

  assert.throws(() => client.markReady(24), failure);
});

test("accepts an already-ready pull request without marking it ready again", async () => {
  const client = new FixtureClient({
    pulls: [
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(client.calls.some(([name]) => name === "markReady"), false);
});

test("accepts repeated guarded base updates and pins auto-merge to each trusted head", async () => {
  const client = new FixtureClient({
    checks: [pendingChecks, pendingChecks, passingChecks],
    commits: {
      "head-2": { parents: ["head-1", "base-1"], sha: "head-2" },
      "head-3": { parents: ["head-2", "base-2"], sha: "head-3" },
    },
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeState: "BEHIND" }),
      pull({ baseSha: "base-1", headSha: "head-2", isDraft: false }),
      pull({ baseSha: "base-2", headSha: "head-2", isDraft: false, mergeState: "BEHIND" }),
      pull({ baseSha: "base-2", headSha: "head-3", isDraft: false }),
      pull({ headSha: "head-3", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    refs: [{ sha: "head-3" }, null],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.trustedHead, "head-3");
  assert.deepEqual(client.calls.filter(([name]) => name === "updateBranch"), [
    ["updateBranch", 24, "head-1"],
    ["updateBranch", 24, "head-2"],
  ]);
  assert.deepEqual(client.calls.filter(([name]) => name === "enablePullRequestAutoMerge"), [
    ["enablePullRequestAutoMerge", 24, "head-1"],
    ["enablePullRequestAutoMerge", 24, "head-2"],
    ["enablePullRequestAutoMerge", 24, "head-3"],
  ]);
});

test("stops on a merge conflict", async () => {
  const client = new FixtureClient({
    checks: [pendingChecks],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeState: "DIRTY", mergeable: "CONFLICTING" }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "merge_conflict" });
});

test("stops on failed or cancelled required checks", async () => {
  await Promise.all(
    ["fail", "cancel"].map(async (bucket) => {
      const client = new FixtureClient({
        checks: [[{ bucket, name: "static-analysis", state: bucket.toUpperCase() }]],
        pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
      });

      await assert.rejects(completePullRequest(client, immediateOptions), { code: "required_check_failed" });
    }),
  );
});

test("stops when the head changes outside a guarded base update", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ headSha: "unexpected", isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unexpected_head_change" });
  assert.equal(client.calls.some(([name]) => name === "enableRepositoryAutoMerge"), false);
  assert.equal(client.calls.some(([name]) => name === "enablePullRequestAutoMerge"), false);
});

test("surfaces repository permission failures before enabling pull request auto-merge", async () => {
  const client = new FixtureClient({
    enableRepositoryError: new Error("HTTP 403: auto-merge requires administration permission"),
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(
    completePullRequest(client, immediateOptions),
    PERMISSION_ERROR,
  );
  assert.equal(client.calls.some(([name]) => name === "enablePullRequestAutoMerge"), false);
});

test("refuses to delete a remote branch whose ref changed after merge", async () => {
  const client = new FixtureClient({
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    refs: [{ sha: "unexpected" }],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "branch_ref_changed" });
  assert.equal(client.calls.some(([name]) => name === "deleteBranchRef"), false);
});

test("rejects an update commit that is not the observed head and base merge", async () => {
  const client = new FixtureClient({
    checks: [pendingChecks],
    commits: { "head-2": { parents: ["head-1", "other-base"], sha: "head-2" } },
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeState: "BEHIND" }),
      pull({ headSha: "head-2", isDraft: false }),
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "untrusted_base_update" });
});
