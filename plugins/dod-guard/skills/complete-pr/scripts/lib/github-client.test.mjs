// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { GitHubClient } from "./github-client.mjs";

function createFallbackRunner({
  checkRunResponses,
  protection = { checks: [{ app_id: 15_368, context: "build-test" }] },
  statusResponse = { statuses: [] },
}) {
  const calls = [];
  const responses = [...checkRunResponses];
  const runner = (args) => {
    calls.push(args);
    if (args[0] === "pr") {
      return { stderr: "", status: 0, stdout: "[]" };
    }
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    if (endpoint?.includes("required_status_checks")) {
      return { stderr: "", status: 0, stdout: JSON.stringify(protection) };
    }
    if (endpoint?.includes("/check-runs?")) {
      return responses.shift();
    }
    if (endpoint?.includes("/status?")) {
      return { stderr: "", status: 0, stdout: JSON.stringify(statusResponse) };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

function checkRunsResponse(runs) {
  return { stderr: "", status: 0, stdout: JSON.stringify({ check_runs: runs }) };
}

function exactHeadPullRequest() {
  return { baseBranch: "master", headSha: "head-1" };
}

test("retries one transient exact-head check-runs failure with the identical request", () => {
  const { calls, runner } = createFallbackRunner({
    checkRunResponses: [
      { stderr: "HTTP 503: transient provider failure", status: 1, stdout: "" },
      checkRunsResponse([{ app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" }]),
    ],
  });

  const checks = new GitHubClient("owner/repo", 24, runner).getRequiredChecks(24, exactHeadPullRequest());

  const checkRunsCalls = calls.filter((args) => args.some((value) => value.includes("/check-runs?")));
  assert.deepEqual(checks, [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
  assert.equal(checkRunsCalls.length, 2);
  assert.deepEqual(checkRunsCalls[0], checkRunsCalls[1]);
});

test("stops after one transient exact-head check-runs retry", () => {
  const { calls, runner } = createFallbackRunner({
    checkRunResponses: [
      { stderr: "HTTP 500: transient provider failure", status: 1, stdout: "" },
      { stderr: "HTTP 502: transient provider failure", status: 1, stdout: "" },
    ],
  });

  assert.throws(
    () => new GitHubClient("owner/repo", 24, runner).getRequiredChecks(24, exactHeadPullRequest()),
    /HTTP 502: transient provider failure/,
  );

  const checkRunsCalls = calls.filter((args) => args.some((value) => value.includes("/check-runs?")));
  assert.equal(checkRunsCalls.length, 2);
  assert.equal(calls.some((args) => args.some((value) => value.includes("/status?"))), false);
});

for (const [failureName, failureResponse] of [
  ["authentication failure", { stderr: "HTTP 401: bad credentials", status: 1, stdout: "" }],
  ["permission failure", { stderr: "HTTP 403: forbidden", status: 1, stdout: "" }],
  ["rate-limit failure", { stderr: "HTTP 429: rate limited", status: 1, stdout: "" }],
  ["malformed response", { stderr: "", status: 0, stdout: JSON.stringify({ wrong_field: [] }) }],
]) {
  test(`does not retry exact-head check-runs ${failureName}`, () => {
    const { calls, runner } = createFallbackRunner({ checkRunResponses: [failureResponse] });

    assert.throws(
      () => new GitHubClient("owner/repo", 24, runner).getRequiredChecks(24, exactHeadPullRequest()),
    );

    assert.equal(
      calls.filter((args) => args.some((value) => value.includes("/check-runs?"))).length,
      1,
    );
  });
}

test("does not retry or accept a wrong-provider exact-head check run", () => {
  const { calls, runner } = createFallbackRunner({
    checkRunResponses: [checkRunsResponse([
      { app: { id: 57_789 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
    ])],
  });

  const checks = new GitHubClient("owner/repo", 24, runner).getRequiredChecks(24, exactHeadPullRequest());

  assert.deepEqual(checks, [{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }]);
  assert.equal(
    calls.filter((args) => args.some((value) => value.includes("/check-runs?"))).length,
    1,
  );
});

test("reads temporary pull-request refs without exposing a write path", () => {
  const calls = [];
  const client = new GitHubClient("owner/repo", 24, (args) => {
    calls.push(args);
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify([
        { ref: "refs/pull/24/head", object: { sha: "head-1" } },
        { ref: "refs/pull/24/merge", object: { sha: "merge-1" } },
      ]),
    };
  });

  assert.deepEqual(client.getPullRequestRefs(), [
    { kind: "head", ref: "refs/pull/24/head", sha: "head-1" },
    { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-1" },
  ]);
  assert.deepEqual(calls, [["api", "repos/owner/repo/git/matching-refs/pull/24"]]);
  assert.equal(calls.some((args) => args.includes("--method") || args.includes("PUT") || args.includes("POST")), false);
});

test("treats an absent temporary pull-request ref set as empty", () => {
  const client = new GitHubClient("owner/repo", 24, () => ({
    status: 1,
    stderr: "HTTP 404: Not Found",
    stdout: "",
  }));

  assert.deepEqual(client.getPullRequestRefs(), []);
});

test("rejects malformed and duplicate temporary pull-request refs", () => {
  for (const response of [
    [{ ref: "refs/pull/24/head", object: {} }],
    [{ ref: "refs/pull/24/other", object: { sha: "head-1" } }],
    [
      { ref: "refs/pull/24/head", object: { sha: "head-1" } },
      { ref: "refs/pull/24/head", object: { sha: "head-1" } },
    ],
  ]) {
    const client = new GitHubClient("owner/repo", 24, () => ({
      status: 0,
      stderr: "",
      stdout: JSON.stringify(response),
    }));

    assert.throws(() => client.getPullRequestRefs(), { code: "github_response_shape" });
  }
});

test("rejects a malformed source branch ref", () => {
  const client = new GitHubClient("owner/repo", 24, () => ({
    status: 0,
    stderr: "",
    stdout: JSON.stringify({ object: {} }),
  }));

  assert.throws(() => client.getSourceBranchRef("codex/24-complete-pr"), {
    code: "github_response_shape",
  });
});
