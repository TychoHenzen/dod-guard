// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import { FixtureClient, immediateOptions, passingChecks, pendingChecks, pull } from "./complete-pr.test-support.mjs";

const liveBaseMergePattern = /guarded merge of head-1 and base-2/;
const syncedMessagePattern = /moved from head-1 to the verified sync head head-2; nothing was merged/;
const rebindRecoveryPattern = /Rebind the handoff to head-2.*--pushed-head head-2/;

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

test("stops with branch_synced after one verified guarded update and never merges", async () => {
  const client = laggingBaseClient();

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "branch_synced",
    message: syncedMessagePattern,
    recovery: rebindRecoveryPattern,
  });
  assert.deepEqual(
    client.calls.filter(([name]) => name === "updateBranch" || name === "getBaseBranchRef"),
    [
      ["getBaseBranchRef", "master"],
      ["updateBranch", 24, "head-1"],
    ],
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
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

test("a rerun at the synced head merges without another sync", async () => {
  const synced = pull({ baseSha: "base-2", headSha: "head-2", isDraft: false });
  const merged = pull({ headSha: "head-2", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" });
  const client = new FixtureClient({
    checks: [passingChecks],
    pulls: [synced, synced, synced, merged],
    refs: [{ sha: "head-2" }, null],
  });

  const result = await completePullRequest(client, { ...immediateOptions, pushedHead: "head-2" });

  assert.equal(result.trustedHead, "head-2");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "updateBranch" || name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-2"]],
  );
});
