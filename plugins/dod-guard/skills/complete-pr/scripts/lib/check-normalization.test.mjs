// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { normalizeRequiredChecks } from "./check-normalization.mjs";
import { GitHubClient } from "./github-client.mjs";

test("normalizes exact-head provider checks and GitHub's passing conclusions", () => {
  assert.deepEqual(
    normalizeRequiredChecks(
      {
        checks: [
          { context: "success", app_id: 15_368 },
          { context: "neutral", app_id: 15_368 },
          { context: "skipped", app_id: 15_368 },
        ],
      },
      [
        { app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name: "success", status: "completed" },
        { app: { id: 15_368 }, conclusion: "neutral", head_sha: "head-1", name: "neutral", status: "completed" },
        { app: { id: 15_368 }, conclusion: "skipped", head_sha: "head-1", name: "skipped", status: "completed" },
      ],
      [],
      "head-1",
    ),
    [
      { bucket: "pass", name: "success", state: "SUCCESS" },
      { bucket: "pass", name: "neutral", state: "NEUTRAL" },
      { bucket: "pass", name: "skipped", state: "SKIPPED" },
    ],
  );
});

test("fails closed for wrong providers, stale heads, duplicate runs, and failed statuses", () => {
  const protection = { checks: [{ context: "build-test", app_id: 15_368 }] };
  assert.deepEqual(
    normalizeRequiredChecks(
      protection,
      [{ app: { id: 57_789 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" }],
      [],
      "head-1",
    ),
    [{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }],
  );
  assert.deepEqual(
    normalizeRequiredChecks(
      protection,
      [{ app: { id: 15_368 }, conclusion: "success", head_sha: "old-head", name: "build-test", status: "completed" }],
      [],
      "head-1",
    ),
    [{ bucket: "unknown", name: "build-test", state: "STALE_HEAD" }],
  );
  assert.deepEqual(
    normalizeRequiredChecks(
      protection,
      [
        { app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
        { app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
      ],
      [],
      "head-1",
    ),
    [{ bucket: "unknown", name: "build-test", state: "DUPLICATE" }],
  );
  assert.deepEqual(
    normalizeRequiredChecks(
      { contexts: ["build-test"] },
      [],
      [{ context: "build-test", sha: "head-1", state: "failure" }],
      "head-1",
    ),
    [{ bucket: "fail", name: "build-test", state: "FAILURE" }],
  );
});

test("covers missing, pending, provider-conflict, duplicate-source, and terminal boundaries", () => {
  const protectedCheck = { checks: [{ context: "build-test", app_id: 15_368 }] };
  assert.deepEqual(
    normalizeRequiredChecks(protectedCheck, [], [], "head-1"),
    [{ bucket: "unknown", name: "build-test", state: "MISSING" }],
  );
  assert.deepEqual(
    normalizeRequiredChecks(
      protectedCheck,
      [{ app: { id: 15_368 }, head_sha: "head-1", name: "build-test", status: "in_progress" }],
      [],
      "head-1",
    ),
    [{ bucket: "pending", name: "build-test", state: "IN_PROGRESS" }],
  );
  assert.deepEqual(
    normalizeRequiredChecks(
      protectedCheck,
      [
        { app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
        { app: { id: 57_789 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
      ],
      [],
      "head-1",
    ),
    [{ bucket: "unknown", name: "build-test", state: "PROVIDER_CONFLICT" }],
  );
  assert.deepEqual(
    normalizeRequiredChecks(
      { contexts: ["build-test"] },
      [{ conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" }],
      [{ context: "build-test", sha: "head-1", state: "success" }],
      "head-1",
    ),
    [{ bucket: "unknown", name: "build-test", state: "DUPLICATE" }],
  );
  assert.deepEqual(
    normalizeRequiredChecks(
      { checks: [{ context: "build-test", app_id: -1 }] },
      [{ app: { id: 57_789 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" }],
      [],
      "head-1",
    ),
    [{ bucket: "pass", name: "build-test", state: "SUCCESS" }],
  );

  const terminalCases = [
    ["cancelled", "fail"],
    ["timed_out", "fail"],
    ["action_required", "fail"],
    ["stale", "fail"],
    ["startup_failure", "fail"],
    ["something_new", "unknown"],
  ];
  for (const [conclusion, bucket] of terminalCases) {
    assert.equal(
      normalizeRequiredChecks(
        protectedCheck,
        [{ app: { id: 15_368 }, conclusion, head_sha: "head-1", name: "build-test", status: "completed" }],
        [],
        "head-1",
      )[0].bucket,
      bucket,
    );
  }
});

test("reads protected exact-head checks when the required-check query is empty", () => {
  const calls = [];
  const responses = [
    { check_runs: [{ app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" }] },
    { statuses: [] },
  ];
  const commandRunner = (args) => {
    calls.push(args);
    if (args[0] === "pr") {
      return { stderr: "", status: 0, stdout: "[]" };
    }
    if (args[1].includes("required_status_checks")) {
      return { stderr: "", status: 0, stdout: JSON.stringify({ checks: [{ app_id: 15_368, context: "build-test" }] }) };
    }
    return { stderr: "", status: 0, stdout: JSON.stringify(responses.shift()) };
  };

  const checks = new GitHubClient("owner/repo", 24, commandRunner).getRequiredChecks(24, {
    baseBranch: "master",
    headSha: "head-1",
  });

  assert.deepEqual(checks, [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
  assert.deepEqual(calls.slice(0, 4).map((args) => args[0]), ["pr", "api", "api", "api"]);
  const checkRunsCall = calls.find((args) => args.some((arg) => arg.includes("check-runs")));
  const statusesCall = calls.find((args) => args.some((arg) => arg.endsWith("/status?per_page=100")));
  assert.ok(checkRunsCall);
  assert.ok(statusesCall);
  assert.ok(checkRunsCall.includes("--paginate"));
  assert.ok(checkRunsCall.some((arg) => /commits\/head-1\/check-runs\?per_page=100$/.test(arg)));
  assert.ok(statusesCall.some((arg) => /commits\/head-1\/status\?per_page=100$/.test(arg)));
});

test("uses the combined-status envelope SHA for status-only requirements", () => {
  const responses = [
    { check_runs: [] },
    { sha: "head-1", statuses: [{ context: "build-test", state: "success" }] },
  ];
  const commandRunner = (args) => {
    if (args[0] === "pr") {
      return { stderr: "", status: 0, stdout: "[]" };
    }
    if (args[1]?.includes("required_status_checks")) {
      return { stderr: "", status: 0, stdout: JSON.stringify({ contexts: ["build-test"] }) };
    }
    return { stderr: "", status: 0, stdout: JSON.stringify(responses.shift()) };
  };

  const checks = new GitHubClient("owner/repo", 24, commandRunner).getRequiredChecks(24, {
    baseBranch: "master",
    headSha: "head-1",
  });

  assert.deepEqual(checks, [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
});
