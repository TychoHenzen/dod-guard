// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import {
  createFixtureLocalGit,
  FixtureClient,
  immediateOptions,
  pendingChecks,
  pull,
} from "./complete-pr.test-support.mjs";
import { mergingPulls } from "./complete-pr-flows.test-support.mjs";
import { GitHubClient } from "./github-client.mjs";
import { normalizePullRequest } from "./pull-requests.mjs";

const PERMISSION_ERROR = /HTTP 403: auto-merge requires administration permission/;

const codexMethodPattern = /codex/i;

test("uses the converged SHA for CI, merge, and cleanup", async () => {
  const client = new FixtureClient({
    pulls: [
      pull({ headSha: "head-1", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false }),
      pull({ headSha: "head-2", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    pullRefs: [
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }],
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-2" }],
    ],
    refs: [{ sha: "head-2" }, null],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await completePullRequest(client, { ...immediateOptions, pushedHead: "head-2" });

  assert.equal(result.acceptedHead, "head-2");
  assert.equal(
    client.calls.filter(([name]) => name === "getCiWorkflowRuns").every(([, sha]) => sha === "head-2"),
    true,
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-2"]],
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
});

test("does not run cleanup for a closed pull request without merged_at", async () => {
  const closedState = normalizePullRequest({ state: "closed", merged_at: null }, "owner/repo").state;
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false, state: closedState })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "pull_request_closed" });
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
});

test("stops before REST merge when the ready transition leaves a draft", async () => {
  const client = new FixtureClient({ pulls: [pull(), pull()] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "ready_transition_failed" });
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("stops before REST merge when marking a draft ready fails", async () => {
  const client = new FixtureClient({ pulls: [pull()] });
  client.markReady = () => {
    throw new Error("gh pr ready failed");
  };

  await assert.rejects(completePullRequest(client, immediateOptions), { message: "gh pr ready failed" });
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
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
  assert.equal(
    client.calls.some(([name]) => name === "markReady"),
    false,
  );
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

test("surfaces repository permission failures before enabling pull request auto-merge", async () => {
  const client = new FixtureClient({
    enableRepositoryError: new Error("HTTP 403: auto-merge requires administration permission"),
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), PERMISSION_ERROR);
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("refuses to delete a remote branch whose ref changed after merge", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
    refs: [{ sha: "unexpected" }],
  });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, localGit }), { code: "branch_ref_changed" });
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
  assert.equal(localGit.calls.length, 0);
});

test("merges a draft with green checks and no unresolved thread without any Codex read or wait", async () => {
  const localGit = createFixtureLocalGit();
  const mergedState = "MERGED";
  const client = new FixtureClient({
    pulls: mergingPulls(mergedState),
  });

  const result = await completePullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.trustedHead, "head-1");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "markReady"),
    [["markReady", 24]],
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-1"]],
  );
  assert.equal(
    client.calls.some(([name]) => name === "wait"),
    false,
  );
  const threadReads = client.calls.filter(([name]) => name === "getUnresolvedReviewThreads");
  assert.equal(threadReads.length, 2);
  assert.ok(client.calls.indexOf(threadReads[0]) < client.calls.findIndex(([name]) => name === "markReady"));
  assert.deepEqual(
    Object.getOwnPropertyNames(GitHubClient.prototype).filter((name) => codexMethodPattern.test(name)),
    [],
  );
});

test("completePullRequest stops with merge_timeout when the checks never finish", async () => {
  const client = new FixtureClient({ checks: [pendingChecks], pulls: [pull(), pull({ isDraft: false })] });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, pollLimit: 2 }), { code: "merge_timeout" });
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 2);
});

test("completePullRequest stops with unverified_merge when a merged read has pending checks", async () => {
  const ready = pull({ isDraft: false });
  const client = new FixtureClient({
    checks: [pendingChecks],
    pulls: [pull(), ready, ready, pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unverified_merge",
    message: /complete required-check evidence/,
  });
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
});
