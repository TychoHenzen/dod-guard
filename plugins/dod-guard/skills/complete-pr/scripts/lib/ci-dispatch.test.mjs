// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import { FixtureClient, immediateOptions, passingChecks, pull } from "./complete-pr.test-support.mjs";
import { workflowRun } from "./github-client.test-support.mjs";

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
