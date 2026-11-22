// --no-linked-issue: a pull request that closes no issue merges and cleans up.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import { createFixtureLocalGit, FixtureClient, immediateOptions, pull } from "./complete-pr.test-support.mjs";
import { recoverMergedPullRequest } from "./merged-recovery.mjs";

const mergedPull = () => pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" });

// Open ready reads until the merge, then the merged state, as in the pre-mutation gate's rerun case.
function mergingPulls() {
  return [pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false }), mergedPull()];
}

function completeWithoutIssue(client) {
  return completePullRequest(client, { ...immediateOptions, localGit: createFixtureLocalGit(), noLinkedIssue: true });
}

test("a pull request that closes no issue merges, deletes its branch, and reports no linked issues", async () => {
  const client = new FixtureClient({ issues: [[]], pulls: mergingPulls() });

  const result = await completeWithoutIssue(client);

  assert.deepEqual(
    client.calls.filter(([name]) => name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-1"]],
  );
  assert.deepEqual(result.linkedIssues, []);
  assert.equal(result.branch, "deleted");
});

test("a linked issue is still confirmed closed after the merge", async () => {
  const closedIssue = { number: 24, state: "CLOSED", url: "issue" };
  const client = new FixtureClient({
    issues: [[{ ...closedIssue, state: "OPEN" }], [closedIssue]],
    pulls: mergingPulls(),
  });

  const result = await completeWithoutIssue(client);

  // Only the second poll reads the issue as closed, so this result proves the confirmation still ran.
  assert.deepEqual(result.linkedIssues, [closedIssue]);
});

test("recovery of a merged pull request with no closing issue cleans up without reading a Project", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    issues: [[]],
    projectStatusReader: () => {
      throw new Error("no linked issue has a Project status to read");
    },
    pulls: [mergedPull()],
    refs: [{ sha: "head-1" }, null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit, noLinkedIssue: true });

  assert.deepEqual(result.linkedIssues, []);
  assert.equal(result.branch, "deleted");
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
});
