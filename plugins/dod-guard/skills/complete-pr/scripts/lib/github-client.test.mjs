// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { GitHubClient } from "./github-client.mjs";
import { okResponse } from "./github-client.test-support.mjs";

test("rejects a malformed source branch ref", () => {
  const client = new GitHubClient("owner/repo", 24, () => ({
    status: 0,
    stderr: "",
    stdout: JSON.stringify({ object: {} }),
  }));

  assert.throws(() => client.getSourceBranchRef("codex/24-complete-pr"), {
    code: "github_response_shape",
  });
});

test("reads the live base branch tip from its branch ref and returns null when the ref is absent", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: JSON.stringify({ object: { sha: "base-2" } }) };
  });
  const absent = new GitHubClient("owner/repo", 24, () => ({ status: 1, stderr: "HTTP 404: Not Found", stdout: "" }));

  assert.deepEqual(client.getBaseBranchRef("master"), { sha: "base-2" });
  assert.deepEqual(calls, [["api", "repos/owner/repo/git/ref/heads/master"]]);
  assert.equal(absent.getBaseBranchRef("master"), null);
});

test("GitHubClient forwards every method to its resource with the injected runner", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    throw new Error("stop after the first request");
  };
  const client = new GitHubClient("owner/repo", 24, runner);
  const rows = [
    ["getRepository", () => client.getRepository(), "repos/owner/repo"],
    ["getPullRequest", () => client.getPullRequest(), "repos/owner/repo/pulls/24"],
    ["getPullRequestRefs", () => client.getPullRequestRefs(), "repos/owner/repo/git/matching-refs/pull/24/"],
    ["markReady", () => client.markReady(24), "repos/owner/repo/pulls/24"],
    ["getUnresolvedReviewThreads", () => client.getUnresolvedReviewThreads(24), "graphql"],
    ["enableRepositoryAutoMerge", () => client.enableRepositoryAutoMerge(), "allow_auto_merge=true"],
    ["mergePullRequest", () => client.mergePullRequest(24, "head-1"), "repos/owner/repo/pulls/24/merge"],
    [
      "getRequiredChecks",
      () => client.getRequiredChecks({ baseBranch: "master", headSha: "head-1" }),
      "repos/owner/repo/branches/master/protection/required_status_checks",
    ],
    [
      "getCiWorkflowRuns",
      () => client.getCiWorkflowRuns("head-1"),
      "repos/owner/repo/actions/workflows/ci.yml/runs?head_sha=head-1&per_page=100",
    ],
    [
      "dispatchCiWorkflow",
      () => client.dispatchCiWorkflow("codex/24-x"),
      "repos/owner/repo/actions/workflows/ci.yml/dispatches",
    ],
    ["updateBranch", () => client.updateBranch(24, "head-1"), "repos/owner/repo/pulls/24/update-branch"],
    ["getCommit", () => client.getCommit("c1"), "repos/owner/repo/commits/c1"],
    ["getLinkedIssues", () => client.getLinkedIssues(24), "repos/owner/repo/pulls/24"],
    ["getIssueProjectStatuses", () => client.getIssueProjectStatuses(24), "users/owner/projectsV2?per_page=100"],
    ["getBranchRef", () => client.getBranchRef("codex/24-x"), "repos/owner/repo/git/ref/heads/codex/24-x"],
    ["deleteBranchRef", () => client.deleteBranchRef("codex/24-x"), "repos/owner/repo/git/refs/heads/codex/24-x"],
  ];

  for (const [, call, marker] of rows) {
    calls.length = 0;
    // ASSUMPTION: the marker is matched against the joined argument string, because a
    // substring such as "repos/owner/repo/pulls/24" is not an exact element of the args array.
    assert.throws(call, /stop after the first request/);
    assert.ok(calls[0].join(" ").includes(marker), `first request ${JSON.stringify(calls[0])} lacks ${marker}`);
  }

  assert.deepEqual(rows.map(([name]) => name).sort(), [
    "deleteBranchRef",
    "dispatchCiWorkflow",
    "enableRepositoryAutoMerge",
    "getBranchRef",
    "getCiWorkflowRuns",
    "getCommit",
    "getIssueProjectStatuses",
    "getLinkedIssues",
    "getPullRequest",
    "getPullRequestRefs",
    "getRepository",
    "getRequiredChecks",
    "getUnresolvedReviewThreads",
    "markReady",
    "mergePullRequest",
    "updateBranch",
  ]);
});

test("GitHubClient keeps the source and base aliases on the branch ref reader and waits on a timer", async () => {
  const requests = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    requests.push(args);
    return okResponse(JSON.stringify({ object: { sha: "s1" } }));
  });

  const branch = client.getBranchRef("b");
  const branchCalls = requests.splice(0);
  const source = client.getSourceBranchRef("b");
  const sourceCalls = requests.splice(0);
  const base = client.getBaseBranchRef("b");
  const baseCalls = requests.splice(0);

  assert.equal(branchCalls.length, 1);
  assert.deepEqual(sourceCalls, branchCalls);
  assert.deepEqual(baseCalls, branchCalls);
  assert.deepEqual(branch, { sha: "s1" });
  assert.deepEqual(source, { sha: "s1" });
  assert.deepEqual(base, { sha: "s1" });
  assert.equal(await client.wait(0), undefined);
});
