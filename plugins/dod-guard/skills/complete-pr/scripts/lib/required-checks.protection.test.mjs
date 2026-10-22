// biome-ignore-all lint/style/useNamingConvention: object keys mirror the GitHub REST field names.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { checkRunsResponse, exactHeadPullRequest } from "./fixtures/required-checks-runners.mjs";
import { GitHubClient } from "./github-client.mjs";
import { okResponse } from "./github-client.test-support.mjs";
import { readMergedRequiredChecks, readRequiredChecks } from "./required-checks.mjs";

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

// readRequiredChecks is the live reader. readMergedRequiredChecks is the one the closure snapshot
// calls for a merged pull request. getRequiredChecks is complete-pr's way in.
const requiredCheckReaders = [
  ["readRequiredChecks", (runner) => readRequiredChecks("owner/repo", exactHeadPullRequest(), runner)],
  ["readMergedRequiredChecks", (runner) => readMergedRequiredChecks("owner/repo", exactHeadPullRequest(), runner)],
  [
    "getRequiredChecks",
    (runner) => new GitHubClient("owner/repo", 24, runner).getRequiredChecks(exactHeadPullRequest()),
  ],
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
