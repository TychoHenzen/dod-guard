// biome-ignore-all lint/style/useNamingConvention: object keys mirror the GitHub REST field names.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  checkRunsResponse,
  createRestChecksRunner,
  exactHeadPullRequest,
} from "./fixtures/required-checks-runners.mjs";
import { readRequiredChecks } from "./required-checks.mjs";

test("retries one transient exact-head check-runs failure with the identical request", () => {
  const { calls, runner } = createRestChecksRunner({
    checkRunResponses: [
      { stderr: "HTTP 503: transient provider failure", status: 1, stdout: "" },
      checkRunsResponse([
        { app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
      ]),
    ],
  });

  const checks = readRequiredChecks("owner/repo", exactHeadPullRequest(), runner);

  const checkRunsCalls = calls.filter((args) => args.some((value) => value.includes("/check-runs?")));
  assert.deepEqual(checks, [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
  assert.equal(checkRunsCalls.length, 2);
  assert.deepEqual(checkRunsCalls[0], checkRunsCalls[1]);
});

test("stops after one transient exact-head check-runs retry", () => {
  const { calls, runner } = createRestChecksRunner({
    checkRunResponses: [
      { stderr: "HTTP 500: transient provider failure", status: 1, stdout: "" },
      { stderr: "HTTP 502: transient provider failure", status: 1, stdout: "" },
    ],
  });

  assert.throws(
    () => readRequiredChecks("owner/repo", exactHeadPullRequest(), runner),
    (error) =>
      error.message.includes("repos/owner/repo/commits/head-1/check-runs?per_page=100") &&
      error.message.includes("HTTP 502: transient provider failure"),
  );

  const checkRunsCalls = calls.filter((args) => args.some((value) => value.includes("/check-runs?")));
  assert.equal(checkRunsCalls.length, 2);
  assert.equal(
    calls.some((args) => args.some((value) => value.includes("/status?"))),
    false,
  );
});

for (const [failureName, failureResponse] of [
  ["authentication failure", { stderr: "HTTP 401: bad credentials", status: 1, stdout: "" }],
  ["permission failure", { stderr: "HTTP 403: forbidden", status: 1, stdout: "" }],
  ["rate-limit failure", { stderr: "HTTP 429: rate limited", status: 1, stdout: "" }],
  ["malformed response", { stderr: "", status: 0, stdout: JSON.stringify({ wrong_field: [] }) }],
]) {
  test(`does not retry exact-head check-runs ${failureName}`, () => {
    const { calls, runner } = createRestChecksRunner({ checkRunResponses: [failureResponse] });

    assert.throws(() => readRequiredChecks("owner/repo", exactHeadPullRequest(), runner));

    assert.equal(calls.filter((args) => args.some((value) => value.includes("/check-runs?"))).length, 1);
  });
}

test("does not retry or accept a wrong-provider exact-head check run", () => {
  const { calls, runner } = createRestChecksRunner({
    checkRunResponses: [
      checkRunsResponse([
        { app: { id: 57_789 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
      ]),
    ],
  });

  const checks = readRequiredChecks("owner/repo", exactHeadPullRequest(), runner);

  assert.deepEqual(checks, [{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }]);
  assert.equal(calls.filter((args) => args.some((value) => value.includes("/check-runs?"))).length, 1);
});

const exactHeadBuildTestRun = {
  app: { id: 15_368 },
  conclusion: "success",
  head_sha: "head-1",
  name: "build-test",
  status: "completed",
};

test("getRequiredChecks reads only REST endpoints and settles two passing runs from two check suites", () => {
  const { calls, runner } = createRestChecksRunner({
    checkRunResponses: [
      checkRunsResponse([
        { id: 101, ...exactHeadBuildTestRun },
        { id: 102, ...exactHeadBuildTestRun },
      ]),
    ],
  });

  const checks = readRequiredChecks("owner/repo", exactHeadPullRequest(), runner);

  assert.deepEqual(checks, [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
  assert.deepEqual(
    calls.map((args) => args[0]),
    ["api", "api", "api"],
  );
});
