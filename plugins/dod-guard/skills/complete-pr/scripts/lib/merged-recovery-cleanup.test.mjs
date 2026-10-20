// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { createFixtureLocalGit, FixtureClient, immediateOptions, pull } from "./complete-pr.test-support.mjs";
import { recoverMergedPullRequest } from "./merged-recovery.mjs";

test("stops before local cleanup when trusted remote deletion is not confirmed", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, { sha: "head-1" }],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), {
    code: "branch_delete_unconfirmed",
  });

  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
  assert.equal(localGit.calls.length, 0);
});

test("treats an ambiguous remote branch deletion as successful after absent readback", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    deleteBranchError: new Error("connection reset"),
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.branch, "deleted");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "getBranchRef"),
    [
      ["getBranchRef", "codex/24-complete-pr"],
      ["getBranchRef", "codex/24-complete-pr"],
    ],
  );
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
});

test("preserves a remote branch when deletion fails and readback still finds the trusted ref", async () => {
  const localGit = createFixtureLocalGit();
  const failure = new Error("remote branch delete failed");
  const client = new FixtureClient({
    deleteBranchError: failure,
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, { sha: "head-1" }],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), failure);
  assert.equal(localGit.calls.length, 0);
  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
});

test("refuses merged recovery when a linked issue is not Done in its Project", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    projectStatuses: [[]],
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), {
    code: "project_not_done",
  });
  assert.equal(localGit.calls.length, 0);
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
});

test("does not authorize cleanup unless the sole Project status is Done", async () => {
  for (const statuses of [["Done", "In Progress"], ["Done", "Done"], [], [" "]]) {
    const localGit = createFixtureLocalGit();
    const client = new FixtureClient({
      projectStatuses: [statuses],
      pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    });

    await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), {
      code: "project_not_done",
    });
    assert.equal(
      client.calls.some(([name]) => name === "deleteBranchRef"),
      false,
    );
    assert.equal(localGit.calls.length, 0);
  }
});
