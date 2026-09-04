// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";

const pendingChecks = [{ bucket: "pending", name: "build-test", state: "IN_PROGRESS" }];
const passingChecks = [{ bucket: "pass", name: "build-test", state: "SUCCESS" }];
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

function nextValue(values) {
  if (values.length > 1) {
    return values.shift();
  }
  return values[0];
}

class FixtureClient {
  constructor(options = {}) {
    this.repository = {
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
    this.refs = [...(options.refs ?? [{ sha: "head-1" }, null])];
    this.enableRepositoryError = options.enableRepositoryError;
    this.calls = [];
  }

  getRepository() {
    return this.repository;
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
    return nextValue(this.checks);
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

  getBranchRef() {
    return nextValue(this.refs);
  }

  deleteBranchRef(branchName) {
    this.calls.push(["deleteBranchRef", branchName]);
  }

  wait() {
    this.calls.push(["wait"]);
  }
}

const immediateOptions = { issuePollLimit: 2, pollLimit: 8, pollMs: 0, updatePollLimit: 2 };

test("waits for required checks, confirms merge, and deletes the trusted remote branch", async () => {
  const client = new FixtureClient({
    checks: [pendingChecks, passingChecks],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(client.calls.filter(([name]) => name === "deleteBranchRef"), [
    ["deleteBranchRef", "codex/24-complete-pr"],
  ]);
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
