// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import {
  createFixtureLocalGit,
  FixtureClient,
  immediateOptions,
  mutationCallNames,
  newestRunFailsPerCheck,
  passingChecks,
  pendingChecks,
  protectedRequiredChecks,
  protectionEndpoint,
  pull,
  requiredCheckNames,
  restChecksReader,
  sequenceCases,
  twoPassingRunsPerCheck,
  unresolvedThread,
} from "./complete-pr.test-support.mjs";
import { CompletionError } from "./completion-error.mjs";
import { GitHubClient } from "./github-client.mjs";
import { workflowRun } from "./github-client.test-support.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";
import { recoverMergedPullRequest } from "./merged-recovery.mjs";
import { normalizePullRequest } from "./pull-requests.mjs";

const PERMISSION_ERROR = /HTTP 403: auto-merge requires administration permission/;
const codexMethodPattern = /codex/i;
const closesRemedyPattern = /Add "Closes #<parent>"/;
const splitRemedyPattern = /split the undelivered scope/;

const discussionUrlPattern = /https:\/\/github\.com\/owner\/repo\/pull\/24#discussion_r1/;
const sourcePathPattern = /src\/a\.mjs/;
const liveBaseMergePattern = /guarded merge of head-1 and base-2/;

test("waits for stale PR and temporary head refs to converge", async () => {
  const client = new FixtureClient({
    pulls: [pull({ headSha: "head-2", isDraft: false })],
    pullRefs: [
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }],
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-2" }],
    ],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await waitForHeadConvergence(client, {
    expectedHead: "head-2",
    initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
    options: { headPollLimit: 2, pollMs: 0 },
    repository: client.repositoryDetails,
  });

  assert.equal(result.headSha, "head-2");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "wait"),
    [["wait"]],
  );
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

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

test("stops after bounded stale-head convergence without writes", async () => {
  const client = new FixtureClient({
    pulls: [pull({ headSha: "head-1", isDraft: false }), pull({ headSha: "head-1", isDraft: false })],
    pullRefs: [[{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }]],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
      options: { headPollLimit: 2, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_convergence_timeout", message: /head-2.*head-1/ },
  );
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

test("stops when the source branch moves during convergence", async () => {
  const client = new FixtureClient({
    pullRefs: [[{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }]],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-3" }],
  });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
      options: { headPollLimit: 2, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_branch_changed", message: /head-2.*head-3/ },
  );
});

test("rejects a generated merge ref that omits the synchronized source parent", async () => {
  const client = new FixtureClient({
    commits: { "merge-ref": { parents: ["base-1", "other-head"], sha: "merge-ref" } },
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_merge_ref_mismatch", message: /head-2/ },
  );
});

test("retries a stale generated merge ref until the synchronized source parent appears", async () => {
  const client = new FixtureClient({
    commits: {
      "merge-old": { parents: ["base-1", "head-1"], sha: "merge-old" },
      "merge-new": { parents: ["base-1", "head-2"], sha: "merge-new" },
    },
    pulls: [pull({ headSha: "head-2", isDraft: false })],
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-1" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-old" },
      ],
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-new" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await waitForHeadConvergence(client, {
    expectedHead: "head-2",
    initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
    options: { headPollLimit: 2, pollMs: 0 },
    repository: client.repositoryDetails,
  });

  assert.equal(result.headSha, "head-2");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "wait"),
    [["wait"]],
  );
});

test("stops on missing temporary head evidence", async () => {
  const client = new FixtureClient({
    pullRefs: [[]],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-1", isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_convergence_timeout", message: /<missing>/ },
  );
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

test("stops on a temporary-ref provider read failure", async () => {
  const client = new FixtureClient({ sourceRefs: [{ sha: "head-2" }] });
  const failure = new Error("HTTP 503: temporary ref read failed");
  client.getPullRequestRefs = () => {
    throw failure;
  };

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
      options: { headPollLimit: 2, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    {
      code: "head_convergence_provider_error",
      message:
        /temporary pull-request refs.*expected synchronized SHA head-2.*HTTP 503: temporary ref read failed.*source branch head-2.*PR API head head-2.*refs\/pull\/24\/head <unread>/,
    },
  );
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

test("includes identities when a synthetic merge ref read fails", async () => {
  const client = new FixtureClient({
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }],
  });
  const failure = new Error("HTTP 503: synthetic merge ref read failed");
  client.getCommit = () => {
    throw failure;
  };

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    {
      code: "head_convergence_provider_error",
      message:
        /synthetic merge ref.*expected synchronized SHA head-2.*HTTP 503: synthetic merge ref read failed.*source branch head-2.*PR API head head-2.*refs\/pull\/24\/head head-2/,
    },
  );
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

test("recovers missing ci.yml and completes after exact-head checks pass", async () => {
  const client = new FixtureClient({
    clientRepository: "owner/repo",
    workflowRuns: [[], [workflowRun("head-1", { path: ".github/workflows/ci.yml" })]],
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
  assert.deepEqual(
    client.calls.filter(([name]) => name === "getRequiredChecks"),
    [["getRequiredChecks"]],
  );
  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
});

test("accepts one exact-head ci.yml run for each trigger event", async () => {
  const client = new FixtureClient({
    workflowRuns: [[workflowRun("head-1", { event: "push" }), workflowRun("head-1", { event: "pull_request" })]],
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
  assert.ok(client.calls.some(([name]) => name === "getCiWorkflowRuns"));
});

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
    requiredChecksReader: restChecksReader({
      protection: protectedRequiredChecks(),
      checkRuns: twoPassingRunsPerCheck(),
    }),
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
    requiredChecksReader: restChecksReader({
      protection: protectedRequiredChecks(),
      checkRuns: newestRunFailsPerCheck(),
    }),
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

test("waits for required checks, confirms merge, and deletes the trusted remote branch", async () => {
  const localGit = createFixtureLocalGit();
  const mergedState = normalizePullRequest({ state: "closed", merged_at: "2026-09-12T13:47:19Z" }, "owner/repo").state;
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

  const result = await completePullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(result.local, { branch: "deleted", currentCheckout: "switched_to_default" });
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
  assert.deepEqual(
    client.calls.filter(([name]) => name === "markReady"),
    [["markReady", 24]],
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
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
  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
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

test("treats a skipped required check alongside passing checks as complete", async () => {
  const client = new FixtureClient({
    checks: [
      [
        { bucket: "skipping", name: "build-test", state: "SKIPPED" },
        { bucket: "pass", name: "plugin-config", state: "SUCCESS" },
        { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
        { bucket: "pass", name: "package-integrity", state: "SUCCESS" },
      ],
    ],
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

test("reports the reason for unsupported required-check evidence", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /PROVIDER_MISMATCH/,
  });
});

test("stops on missing required-check evidence without merge or branch cleanup", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /MISSING/,
  });
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "dispatch"),
    false,
  );
});

test("stops on an HTTP 403 branch-protection read naming the endpoint and sends no merge request", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
    requiredChecksReader: restChecksReader({
      protection: { stderr: "gh: Resource not accessible by personal access token (HTTP 403)", status: 1, stdout: "" },
    }),
  });

  await assert.rejects(
    completePullRequest(client, immediateOptions),
    (error) => error.message.includes(protectionEndpoint) && error.message.includes("HTTP 403"),
  );
  assert.ok(client.calls.some(([name]) => name === "getRequiredChecks"));
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("stops with missing_required_checks on an unprotected base and sends no merge request", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
    requiredChecksReader: restChecksReader({
      protection: { stderr: "gh: Not Found (HTTP 404)", status: 1, stdout: "" },
    }),
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "missing_required_checks" });
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("stops without merge or branch cleanup after required-check read failure", async () => {
  const localGit = createFixtureLocalGit();
  const failure = new Error("HTTP 500: transient provider failure");
  const client = new FixtureClient({
    requiredChecksError: failure,
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, localGit }), failure);
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
  assert.equal(localGit.calls.length, 0);
});

test("dispatches missing ci.yml once after verifying the same-repository " + "branch head", async () => {
  const client = new FixtureClient({
    workflowRuns: [[], [workflowRun("head-1")]],
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, ciRunPollLimit: 1 }), {
    code: "unknown_check_state",
  });

  const dispatches = client.calls.filter(([name]) => name === "dispatch");
  assert.deepEqual(dispatches, [["dispatch", "codex/24-complete-pr"]]);
  const branchRefIndex = client.calls.findIndex(([name]) => name === "getBranchRef");
  const dispatchIndex = client.calls.findIndex(([name]) => name === "dispatch");
  assert.ok(branchRefIndex >= 0);
  assert.ok(branchRefIndex < dispatchIndex);
  const dispatchCall = client.calls.findIndex(([name]) => name === "dispatch");
  const requiredChecksCall = client.calls.findIndex(([name]) => name === "getRequiredChecks");
  assert.ok(dispatchCall < requiredChecksCall);
});

test("leaves a pending ci.yml run pending instead of accepting missing job checks", async () => {
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

  await assert.rejects(completePullRequest(client, { ...immediateOptions, ciRunPollLimit: 4 }), {
    code: "unknown_check_state",
  });

  const requiredChecksCalls = client.calls.filter(([name]) => name === "getRequiredChecks");
  assert.equal(requiredChecksCalls.length, 1);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 3);
  assert.equal(
    client.calls.some(([name]) => name === "dispatch"),
    false,
  );
  const autoMergeIndex = client.calls.findIndex(([name]) => name === "enableRepositoryAutoMerge");
  const workflowReads = client.calls.slice(0, autoMergeIndex).filter(([name]) => name === "getCiWorkflowRuns");
  assert.equal(workflowReads.length, 4);
});

test("does not merge when an exact-head ci.yml run stays pending", async () => {
  const client = new FixtureClient({
    workflowRuns: [[workflowRun("head-1", { conclusion: null, status: "in_progress" })]],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_run_timeout",
    message: /remained pending/,
  });

  const workflowReads = client.calls.filter(([name]) => name === "getCiWorkflowRuns");
  assert.equal(workflowReads.length, 2);
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 1);
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "getRequiredChecks"),
    false,
  );
});

test("fails before REST merge when no exact-head ci.yml run appears " + "after dispatch", async () => {
  const client = new FixtureClient({
    workflowRuns: [[], []],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_run_timeout",
    message: /head-1/,
  });
  assert.deepEqual(
    client.calls.filter(([name]) => name === "dispatch"),
    [["dispatch", "codex/24-complete-pr"]],
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("does not dispatch for a forked PR or a branch that moved from the " + "trusted head", async () => {
  const forked = new FixtureClient({
    pulls: [pull({ headRepository: "fork/repo", isCrossRepository: true })],
  });
  await assert.rejects(completePullRequest(forked, immediateOptions), { code: "cross_repository_head" });
  assert.equal(
    forked.calls.some(([name]) => name === "dispatch"),
    false,
  );

  const moved = new FixtureClient({
    workflowRuns: [[]],
    refs: [{ sha: "new-head" }],
    pulls: [pull(), pull({ isDraft: false })],
  });
  await assert.rejects(completePullRequest(moved, immediateOptions), {
    code: "ci_branch_head_mismatch",
    message: /head-1.*new-head/,
  });
  assert.equal(
    moved.calls.some(([name]) => name === "dispatch"),
    false,
  );
  assert.equal(
    moved.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );

  const missingBranch = new FixtureClient({
    workflowRuns: [[]],
    refs: [null],
    pulls: [pull(), pull({ isDraft: false })],
  });
  await assert.rejects(completePullRequest(missingBranch, immediateOptions), { code: "ci_branch_not_found" });
  assert.equal(
    missingBranch.calls.some(([name]) => name === "dispatch"),
    false,
  );
});

test(
  "fails closed for duplicate, stale, wrong-workflow, failed, cancelled, " + "and unsupported ci.yml runs",
  async () => {
    const cases = [
      {
        code: "duplicate_ci_workflow_run",
        runs: [workflowRun("head-1", { event: "push" }), workflowRun("head-1", { event: "push" })],
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
        code: "unrelated_ci_workflow_run",
        runs: [workflowRun("head-1", { path: ".github/workflows/ci.yml.bak" })],
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

      await assert.rejects(completePullRequest(client, immediateOptions), { code });
      assert.equal(
        client.calls.some(([name]) => name === "mergePullRequest"),
        false,
      );
    }
  },
);

test("reads back after an ambiguous dispatch and never dispatches twice", async () => {
  const client = new FixtureClient({
    workflowRuns: [[], [workflowRun("head-1", { conclusion: null, status: "in_progress" })], [workflowRun("head-1")]],
    workflowDispatchError: new Error("connection reset"),
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unknown_check_state" });
  assert.deepEqual(
    client.calls.filter(([name]) => name === "dispatch"),
    [["dispatch", "codex/24-complete-pr"]],
  );
  assert.equal(client.calls.filter(([name]) => name === "wait").length, 1);
});

test("stops after a rejected dispatch and exact-head readback finds no run", async () => {
  const client = new FixtureClient({
    workflowRuns: [[], []],
    workflowDispatchError: new Error("HTTP 403: Actions write permission is required"),
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_dispatch_failed",
    message: /HTTP 403.*no exact-head run/,
  });
  assert.equal(client.calls.filter(([name]) => name === "dispatch").length, 1);
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("rejects a pull request whose base changes before required-check verification", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ baseBranch: "release", isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "wrong_base_branch" });
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
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
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
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

test("merges a draft with green checks and no unresolved thread without any Codex read or wait", async () => {
  const localGit = createFixtureLocalGit();
  const mergedState = "MERGED";
  const client = new FixtureClient({
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: mergedState }),
    ],
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

const draftAndReadyPullRequests = [
  ["draft", pull()],
  ["ready", pull({ isDraft: false })],
];

for (const [label, pullRequest] of draftAndReadyPullRequests) {
  test(`stops a ${label} pull request with an unresolved review thread before any mutation`, async () => {
    const client = new FixtureClient({
      pulls: [pullRequest],
      reviewThreads: [[unresolvedThread()]],
      workflowRuns: [[]],
    });

    const failure = await completePullRequest(client, immediateOptions).catch((error) => error);

    assert.equal(failure.code, "unresolved-review-threads");
    assert.match(failure.message, discussionUrlPattern);
    assert.match(failure.message, sourcePathPattern);
    assert.deepEqual(
      client.calls.filter(([name]) => mutationCallNames.includes(name)),
      [],
    );
  });
}

for (const [label, pullRequest] of draftAndReadyPullRequests) {
  test(`stops a ${label} pull request with no closing issue reference before any mutation`, async () => {
    const client = new FixtureClient({ pulls: [pullRequest], issues: [[]], workflowRuns: [[]] });

    const failure = await completePullRequest(client, immediateOptions).catch((error) => error);

    assert.equal(failure.code, "missing_linked_issue");
    assert.match(failure.message, closesRemedyPattern);
    assert.match(failure.message, splitRemedyPattern);
    assert.deepEqual(
      client.calls.filter(([name]) => mutationCallNames.includes(name)),
      [],
    );
  });
}

test("a thread opened during the required-check wait stops before the merge, and a rerun after it is resolved merges once", async () => {
  const mergedState = "MERGED";
  const firstRun = new FixtureClient({
    checks: [pendingChecks, passingChecks],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
    reviewThreads: [[], [unresolvedThread()]],
  });

  await assert.rejects(completePullRequest(firstRun, immediateOptions), { code: "unresolved-review-threads" });
  assert.equal(
    firstRun.calls.some(([name]) => name === "wait"),
    true,
  );
  assert.equal(
    firstRun.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );

  const rerun = new FixtureClient({
    pulls: [
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: mergedState }),
    ],
  });

  const result = await completePullRequest(rerun, { ...immediateOptions, localGit: createFixtureLocalGit() });

  assert.deepEqual(
    rerun.calls.filter(([name]) => name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-1"]],
  );
  assert.equal(result.trustedHead, "head-1");
});

test("a review-threads-unavailable error from the reader stops before any mutation with its cause kept", async () => {
  const cause = new Error("GraphQL request timed out");
  const readerError = new CompletionError(
    "review-threads-unavailable",
    "Review threads for pull request #24 could not be read: GraphQL request timed out",
    { cause },
  );
  const client = new FixtureClient({
    pulls: [pull()],
    reviewThreads: [readerError],
    workflowRuns: [[]],
  });

  const failure = await completePullRequest(client, immediateOptions).catch((error) => error);

  assert.equal(failure, readerError);
  assert.equal(failure.code, "review-threads-unavailable");
  assert.equal(failure.cause, cause);
  assert.deepEqual(
    client.calls.filter(([name]) => mutationCallNames.includes(name)),
    [],
  );
});

for (const [code, { pullOverrides, repository }] of sequenceCases) {
  test(`completePullRequest stops with ${code} before any mutation`, async () => {
    const client = new FixtureClient({ pulls: [pull(pullOverrides)], repository });

    await assert.rejects(completePullRequest(client, immediateOptions), { code });
    assert.deepEqual(
      client.calls.filter(([name]) => mutationCallNames.includes(name)),
      [],
    );
  });
}

for (const [code, { pullOverrides, repository }] of sequenceCases) {
  test(`waitForHeadConvergence of a merged pull request stops with ${code}`, async () => {
    const client = new FixtureClient({ repository });

    await assert.rejects(
      waitForHeadConvergence(client, {
        allowMerged: true,
        initialPullRequest: pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED", ...pullOverrides }),
        options: { headPollLimit: 1, pollMs: 0 },
        repository: client.repositoryDetails,
      }),
      { code },
    );
  });
}

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

test("completePullRequest stops with not_open_pull_request before any mutation", async () => {
  const client = new FixtureClient({ pulls: [pull({ state: "CLOSED" })] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "not_open_pull_request" });
  assert.deepEqual(
    client.calls.filter(([name]) => mutationCallNames.includes(name)),
    [],
  );
});

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

test("completePullRequest stops with ci_workflow_dispatch_ambiguous when dispatch and readback both fail", async () => {
  const client = new FixtureClient({
    pulls: [pull({ isDraft: false })],
    workflowDispatchError: new Error("HTTP 403: dispatch rejected"),
    workflowRuns: [
      [],
      () => {
        throw new Error("HTTP 502: readback failed");
      },
    ],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_dispatch_ambiguous",
    message: /Dispatch failed \(HTTP 403: dispatch rejected\); readback failed \(HTTP 502: readback failed\)/,
  });
});

test("waitForHeadConvergence stops with head_branch_not_found when the source branch is gone", async () => {
  const client = new FixtureClient({ sourceRefs: [null] });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-1",
      initialPullRequest: pull({ isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_branch_not_found", message: /codex\/24-complete-pr/ },
  );
});

test("waitForHeadConvergence stops at once on a wrong merge-ref parent when identities already converged", async () => {
  const client = new FixtureClient({
    commits: { "merge-ref": { parents: ["base-1", "other-head"], sha: "merge-ref" } },
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
      options: { headPollLimit: 2, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_merge_ref_mismatch" },
  );
  assert.equal(
    client.calls.some(([name]) => name === "wait"),
    false,
  );
});

test("waitForHeadConvergence stops with head_branch_changed before the temporary refs are read", async () => {
  const client = new FixtureClient({ sourceRefs: [{ sha: "head-3" }] });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-2", isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_branch_changed", message: /moved from head-2 to head-3/ },
  );
  assert.equal(
    client.calls.some(([name]) => name === "getPullRequestRefs"),
    false,
  );
});

test("waitForHeadConvergence stops with head_branch_changed for a merged head and a missing branch", async () => {
  const client = new FixtureClient({ sourceRefs: [null] });

  await assert.rejects(
    waitForHeadConvergence(client, {
      allowMerged: true,
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-3", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_branch_changed", message: /moved from head-2 to head-3/ },
  );
  assert.equal(
    client.calls.some(([name]) => name === "getPullRequestRefs"),
    false,
  );
});

test("a missing closing issue stops before the temporary refs are read", async () => {
  const client = new FixtureClient({ issues: [[]], pulls: [pull()] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "missing_linked_issue" });
  assert.equal(
    client.calls.some(([name]) => name === "getPullRequestRefs"),
    false,
  );
});

test("an unresolved thread stops before the ci.yml run is read", async () => {
  const client = new FixtureClient({ pulls: [pull()], reviewThreads: [[unresolvedThread()]] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unresolved-review-threads" });
  assert.equal(
    client.calls.some(([name]) => name === "getCiWorkflowRuns"),
    false,
  );
});

test("a moved head with a changed base reports the head change first", async () => {
  const ready = pull({ isDraft: false });
  const client = new FixtureClient({
    pulls: [ready, ready, pull({ baseBranch: "release", headSha: "head-2", isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unexpected_head_change" });
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});
