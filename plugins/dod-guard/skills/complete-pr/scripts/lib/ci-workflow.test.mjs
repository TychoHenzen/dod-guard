// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { dispatchCiWorkflow, readCiWorkflowRuns } from "./ci-workflow.mjs";
import { workflowRun } from "./github-client.test-support.mjs";

const workflowRunsField = "workflow_runs";
const workflowRunsPattern = /workflow_runs/;

test("lists ci.yml workflow runs for the trusted head SHA", () => {
  const calls = [];
  const run = workflowRun("head-1");
  const runner = (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ [workflowRunsField]: [run] }),
    };
  };

  assert.deepEqual(readCiWorkflowRuns("owner/repo", "head-1", runner), [run]);
  assert.deepEqual(calls, [
    ["api", "--paginate", "--slurp", "repos/owner/repo/actions/workflows/ci.yml/runs?head_sha=head-1&per_page=100"],
  ]);
});

test("rejects malformed ci.yml workflow responses", () => {
  for (const response of [{}, []]) {
    const runner = () => ({
      status: 0,
      stderr: "",
      stdout: JSON.stringify(response),
    });

    assert.throws(() => readCiWorkflowRuns("owner/repo", "head-1", runner), {
      code: "github_response_shape",
      name: "CompletionError",
      message: workflowRunsPattern,
    });
  }
});

test("dispatches ci.yml through workflow_dispatch at the checked branch", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return { status: 0, stderr: "", stdout: "" };
  };

  dispatchCiWorkflow("owner/repo", "codex/24-complete-pr", runner);

  assert.deepEqual(calls, [
    [
      "api",
      "--method",
      "POST",
      "repos/owner/repo/actions/workflows/ci.yml/dispatches",
      "-f",
      "ref=codex/24-complete-pr",
    ],
  ]);
});
