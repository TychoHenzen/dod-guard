// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import { FixtureClient, immediateOptions, passingChecks, pendingChecks, pull } from "./complete-pr.test-support.mjs";

const liveBaseMergePattern = /guarded merge of head-1 and base-2/;

// The PR read before the update still reports base-1 while the base branch already points at base-2.
function laggingBaseClient(overrides = {}) {
  return new FixtureClient({
    baseRefs: [{ sha: "base-2" }],
    checks: [pendingChecks, passingChecks],
    commits: { "head-2": { parents: ["head-1", "base-2"], sha: "head-2" } },
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeState: "BEHIND" }),
      pull({ baseSha: "base-2", headSha: "head-2", isDraft: false }),
      pull({ baseSha: "base-2", headSha: "head-2", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    refs: [{ sha: "head-2" }, null],
    ...overrides,
  });
}

test("accepts repeated guarded base updates and merges the final trusted head", async () => {
  // Each BEHIND read still shows the previous base; only the live base branch tip names the new one.
  const client = new FixtureClient({
    baseRefs: [{ sha: "base-1" }, { sha: "base-2" }],
    checks: [pendingChecks, pendingChecks, passingChecks],
    commits: {
      "head-2": { parents: ["head-1", "base-1"], sha: "head-2" },
      "head-3": { parents: ["head-2", "base-2"], sha: "head-3" },
    },
    pulls: [
      pull({ baseSha: "base-0" }),
      pull({ baseSha: "base-0", isDraft: false }),
      pull({ baseSha: "base-0", isDraft: false }),
      pull({ baseSha: "base-0", isDraft: false, mergeState: "BEHIND" }),
      pull({ baseSha: "base-1", headSha: "head-2", isDraft: false }),
      pull({ baseSha: "base-1", headSha: "head-2", isDraft: false, mergeState: "BEHIND" }),
      pull({ baseSha: "base-2", headSha: "head-3", isDraft: false }),
      pull({ baseSha: "base-2", headSha: "head-3", isDraft: false }),
      pull({ headSha: "head-3", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    refs: [{ sha: "head-3" }, null],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.trustedHead, "head-3");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "updateBranch" || name === "getBaseBranchRef"),
    [
      ["getBaseBranchRef", "master"],
      ["updateBranch", 24, "head-1"],
      ["getBaseBranchRef", "master"],
      ["updateBranch", 24, "head-2"],
    ],
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-3"]],
  );
});

test("accepts a guarded update against the live base tip when the pull request base lags", async () => {
  const client = laggingBaseClient();

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.trustedHead, "head-2");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "updateBranch" || name === "getBaseBranchRef"),
    [
      ["getBaseBranchRef", "master"],
      ["updateBranch", 24, "head-1"],
    ],
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-2"]],
  );
});

test("rejects an update commit whose base parent is only the lagging pull request base", async () => {
  const client = laggingBaseClient({
    commits: { "head-2": { parents: ["head-1", "base-1"], sha: "head-2" } },
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "untrusted_base_update",
    message: liveBaseMergePattern,
  });
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("stops before a branch update when the base branch ref is missing", async () => {
  const client = laggingBaseClient({ baseRefs: [null] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "base_branch_missing" });
  assert.equal(
    client.calls.some(([name]) => name === "updateBranch" || name === "mergePullRequest"),
    false,
  );
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

test("completePullRequest stops with base_update_timeout when GitHub never publishes the updated head", async () => {
  const ready = pull({ isDraft: false });
  const client = new FixtureClient({
    pulls: [pull(), ready, ready, pull({ isDraft: false, mergeState: "BEHIND" })],
  });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, updatePollLimit: 2 }), {
    code: "base_update_timeout",
  });
  assert.deepEqual(
    client.calls.filter(([name]) => name === "updateBranch"),
    [["updateBranch", 24, "head-1"]],
  );
});
