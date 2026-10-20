// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { okResponse } from "./github-client.test-support.mjs";
import { readRequiredChecks } from "./required-checks.mjs";

function createRestChecksRunner({
  checkRunResponses,
  protection = { checks: [{ app_id: 15_368, context: "build-test" }] },
  statusResponse = { statuses: [] },
}) {
  const calls = [];
  const responses = [...checkRunResponses];
  const runner = (args) => {
    calls.push(args);
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

// Answers the protection read with the given response and gives the check-run and status reads
// empty success, so a read that wrongly carries on shows up as a returned list rather than a runner error.
function protectionFailureRunner(protectionResponse) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    if (endpoint?.includes("required_status_checks")) {
      return protectionResponse;
    }
    if (endpoint?.includes("/check-runs?")) {
      return checkRunsResponse([]);
    }
    if (endpoint?.includes("/status?")) {
      return okResponse(JSON.stringify({ statuses: [] }));
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

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

const protectionEndpoint = "repos/owner/repo/branches/master/protection/required_status_checks";

const serverErrorProtection = {
  stderr: "gh: Server Error (HTTP 502)",
  status: 1,
  stdout: JSON.stringify({ message: "Server Error" }),
};

const forbiddenProtection = {
  stderr: "gh: Resource not accessible by personal access token (HTTP 403)",
  status: 1,
  stdout: JSON.stringify({ message: "Resource not accessible by personal access token" }),
};

// gh can exit with a status other than 0 or 1, which the protection read does not accept.
const unexpectedExitProtection = { stderr: "gh: unexpected failure", status: 2, stdout: "" };

const notFoundProtection = {
  stderr: "gh: Not Found (HTTP 404)",
  status: 1,
  stdout: JSON.stringify({ message: "Branch not protected" }),
};

function readsCheckRunsOrStatuses(calls) {
  return calls.some((args) => args.some((value) => value.includes("/check-runs?") || value.includes("/status?")));
}

// readRequiredChecks is the reader the closure snapshot calls; getRequiredChecks is complete-pr's way in.
const requiredCheckReaders = [
  ["readRequiredChecks", (runner) => readRequiredChecks("owner/repo", exactHeadPullRequest(), runner)],
  ["getRequiredChecks", (runner) => readRequiredChecks("owner/repo", exactHeadPullRequest(), runner)],
];

const protectionFailures = [
  ["a non-404 (HTTP 502)", serverErrorProtection, "HTTP 502"],
  ["an HTTP 403", forbiddenProtection, "HTTP 403"],
  ["an unexpected gh exit status", unexpectedExitProtection, "gh: unexpected failure"],
];

for (const [reader, read] of requiredCheckReaders) {
  for (const [failure, response, detail] of protectionFailures) {
    test(`${reader} stops on ${failure} branch-protection read naming the endpoint, without reading checks`, () => {
      const { calls, runner } = protectionFailureRunner(response);

      assert.throws(
        () => read(runner),
        (error) => error.message.includes(protectionEndpoint) && error.message.includes(detail),
      );
      assert.equal(readsCheckRunsOrStatuses(calls), false);
    });
  }
}

test("getRequiredChecks reads an absent branch protection (HTTP 404) as no required checks", () => {
  const { calls, runner } = protectionFailureRunner(notFoundProtection);

  assert.deepEqual(readRequiredChecks("owner/repo", exactHeadPullRequest(), runner), []);
  assert.equal(readsCheckRunsOrStatuses(calls), false);
});

test("getRequiredChecks names the commit-status endpoint when that read fails", () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    if (endpoint?.includes("required_status_checks")) {
      return okResponse(JSON.stringify({ checks: [{ app_id: 15_368, context: "build-test" }] }));
    }
    if (endpoint?.includes("/check-runs?")) {
      return checkRunsResponse([]);
    }
    if (endpoint?.includes("/status?")) {
      return { stderr: "gh: Bad Gateway (HTTP 502)", status: 1, stdout: "" };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  assert.throws(
    () => readRequiredChecks("owner/repo", exactHeadPullRequest(), runner),
    (error) =>
      error.message.includes("repos/owner/repo/commits/head-1/status?per_page=100") &&
      error.message.includes("HTTP 502"),
  );
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
