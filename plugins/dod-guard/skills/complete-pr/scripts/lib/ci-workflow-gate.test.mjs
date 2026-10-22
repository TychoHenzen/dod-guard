// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { createCiRecovery, ensureCiWorkflowRun } from "./ci-workflow-gate.mjs";
import { completePullRequest } from "./complete-pr.mjs";
import { FixtureClient, immediateOptions, pull } from "./complete-pr.test-support.mjs";
import { mergingPulls } from "./complete-pr-flows.test-support.mjs";
import { workflowRun } from "./github-client.test-support.mjs";

// biome-ignore lint/security/noSecrets: Client method name, not a credential.
const WORKFLOW_RUNS_CALL = "getCiWorkflowRuns";
const PENDING_POLL_READS = 4;
const PENDING_POLL_WAITS = 3;
const REMAINED_PENDING = /remained pending/;
const RERUN_RECOVERY = /gh run rerun .* --failed/;

test("accepts one exact-head ci.yml run for each trigger event", async () => {
  const client = new FixtureClient({
    workflowRuns: [[workflowRun("head-1", { event: "push" }), workflowRun("head-1", { event: "pull_request" })]],
    pulls: mergingPulls("MERGED"),
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.ok(client.calls.some(([name]) => name === WORKFLOW_RUNS_CALL));
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
  assert.equal(client.calls.filter(([name]) => name === "wait").length, PENDING_POLL_WAITS);
  assert.equal(
    client.calls.some(([name]) => name === "dispatch"),
    false,
  );
  const autoMergeIndex = client.calls.findIndex(([name]) => name === "enableRepositoryAutoMerge");
  const workflowReads = client.calls.slice(0, autoMergeIndex).filter(([name]) => name === WORKFLOW_RUNS_CALL);
  assert.equal(workflowReads.length, PENDING_POLL_READS);
});

test("does not merge when an exact-head ci.yml run stays pending", async () => {
  const client = new FixtureClient({
    workflowRuns: [[workflowRun("head-1", { conclusion: null, status: "in_progress" })]],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "ci_workflow_run_timeout",
    message: REMAINED_PENDING,
  });

  const workflowReads = client.calls.filter(([name]) => name === WORKFLOW_RUNS_CALL);
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

test("fails closed for duplicate, stale, wrong-workflow, failed, cancelled, and unsupported ci.yml runs", async () => {
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

    // biome-ignore lint/performance/noAwaitInLoops: Each case must finish its own fixture before the next starts.
    await assert.rejects(completePullRequest(client, immediateOptions), { code });
    assert.equal(
      client.calls.some(([name]) => name === "mergePullRequest"),
      false,
    );
  }
});

test("stops on two workflow_dispatch runs at one head with a rerun recovery", async () => {
  const client = new FixtureClient({
    workflowRuns: [
      [
        workflowRun("head-1", { event: "workflow_dispatch", conclusion: "failure", id: 1 }),
        workflowRun("head-1", { event: "workflow_dispatch", conclusion: "success", id: 2 }),
      ],
    ],
    pulls: [pull(), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), (error) => {
    assert.equal(error.code, "duplicate_ci_workflow_run");
    assert.match(error.recovery, RERUN_RECOVERY);
    return true;
  });
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("ensureCiWorkflowRun stops with missing_pull_request_head before reading any run", async () => {
  for (const overrides of [{ headSha: null }, { headBranch: null }]) {
    const client = new FixtureClient();

    // biome-ignore lint/performance/noAwaitInLoops: Each override case needs its own fixture client.
    await assert.rejects(
      ensureCiWorkflowRun(client, pull({ isDraft: false, ...overrides }), createCiRecovery(immediateOptions)),
      { code: "missing_pull_request_head" },
    );
    assert.equal(
      client.calls.some(([name]) => name === WORKFLOW_RUNS_CALL),
      false,
    );
  }
});
