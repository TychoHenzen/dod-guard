// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  createFixtureLocalGit,
  FixtureClient,
  immediateOptions,
  newestRunFailsPerCheck,
  pendingChecks,
  pull,
  sequenceCases,
  twoPassingRunsPerCheck,
} from "./complete-pr.test-support.mjs";
import { protectedRestReader } from "./complete-pr-flows.test-support.mjs";
import { recoverMergedPullRequest } from "./merged-recovery.mjs";

const closesRemedyPattern = /Add "Closes #<parent>"/;

test("recovers an already-merged pull request through guarded remote and local cleanup", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.branch, "deleted");
  assert.equal(result.local.branch, "deleted");
  assert.equal(result.local.currentCheckout, "switched_to_default");
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "getBranchRef"),
    [
      ["getBranchRef", "codex/24-complete-pr"],
      ["getBranchRef", "codex/24-complete-pr"],
    ],
  );
});

test("recovers a merged head with two passing runs of every required check through the REST reader", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, null],
    requiredChecksReader: protectedRestReader(twoPassingRunsPerCheck()),
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.deepEqual(
    client.calls.filter(([name]) => name === "getRequiredChecks"),
    [["getRequiredChecks"]],
  );
  assert.deepEqual(
    result.linkedIssues.map((issue) => issue.number),
    [24],
  );
  assert.equal(result.branch, "deleted");
});

test("recovery of a merged pull request with no closing issue does not tell the user to edit the body", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    issues: [[]],
    refs: [{ sha: "head-1" }, null],
  });

  const failure = await recoverMergedPullRequest(client, { ...immediateOptions, localGit }).catch((error) => error);

  assert.equal(failure.code, "missing_linked_issue");
  assert.doesNotMatch(failure.message, closesRemedyPattern);
});

test("stops recovery when the newest run of every required check failed through the REST reader", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }, null],
    requiredChecksReader: protectedRestReader(newestRunFailsPerCheck()),
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), {
    code: "required_check_failed",
  });
  assert.deepEqual(
    client.calls.filter(([name]) => name === "getRequiredChecks"),
    [["getRequiredChecks"]],
  );
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
  assert.deepEqual(localGit.calls, []);
});

test("recovers merged cleanup when the remote source branch is already absent", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [null],
    sourceRefs: [null],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.branch, "already_absent");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "getSourceBranchRef"),
    [["getSourceBranchRef", "codex/24-complete-pr"]],
  );
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
});

test("dry-runs merged pull-request recovery without cleanup mutation", async () => {
  const localGit = createFixtureLocalGit({ branch: "would_delete", currentCheckout: "would_switch_to_default" });
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
    refs: [{ sha: "head-1" }],
  });

  const result = await recoverMergedPullRequest(client, { ...immediateOptions, dryRun: true, localGit });

  assert.equal(result.branch, "would_delete");
  assert.equal(result.local.branch, "would_delete");
  assert.equal(result.local.currentCheckout, "would_switch_to_default");
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: true }]]);
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
});

for (const [code, { pullOverrides, repository }] of sequenceCases) {
  test(`recoverMergedPullRequest stops with ${code} before any cleanup`, async () => {
    const localGit = createFixtureLocalGit();
    const client = new FixtureClient({
      pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED", ...pullOverrides })],
      repository,
    });

    await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), { code });
    assert.deepEqual(localGit.calls, []);
    assert.equal(
      client.calls.some(([name]) => name === "deleteBranchRef"),
      false,
    );
  });
}

test("recoverMergedPullRequest stops with not_merged_pull_request for an open pull request", async () => {
  const client = new FixtureClient({ pulls: [pull()] });

  await assert.rejects(recoverMergedPullRequest(client, immediateOptions), { code: "not_merged_pull_request" });
});

test("recoverMergedPullRequest stops with unverified_merge when the merge commit is missing", async () => {
  const client = new FixtureClient({ pulls: [pull({ isDraft: false, mergeCommitSha: null, state: "MERGED" })] });

  await assert.rejects(recoverMergedPullRequest(client, immediateOptions), {
    code: "unverified_merge",
    message: /trusted head or merge commit/,
  });
});

test("recoverMergedPullRequest stops with unverified_merge when required checks are still pending", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    checks: [pendingChecks],
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), {
    code: "unverified_merge",
    message: /complete required-check evidence/,
  });
  assert.deepEqual(localGit.calls, []);
});

test("recoverMergedPullRequest stops with linked_issue_open when the closing issue stays open", async () => {
  const localGit = createFixtureLocalGit();
  const client = new FixtureClient({
    issues: [[{ number: 24, state: "OPEN", url: "issue" }]],
    pulls: [pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" })],
  });

  await assert.rejects(recoverMergedPullRequest(client, { ...immediateOptions, localGit }), {
    code: "linked_issue_open",
  });
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
});
