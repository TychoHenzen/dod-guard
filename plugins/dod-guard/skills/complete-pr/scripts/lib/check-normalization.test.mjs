// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { normalizeCheckRun, normalizeRequiredChecks } from "./check-normalization.mjs";
import { GitHubClient } from "./github-client.mjs";

const headShaField = "head_sha";

test("normalizes workflow run status with the same exact-head check rules", () => {
  const queuedRun = {
    conclusion: null,
    [headShaField]: "head-1",
    name: "ci.yml",
    status: "queued",
  };
  const failedRun = {
    conclusion: "failure",
    [headShaField]: "head-1",
    name: "ci.yml",
    status: "completed",
  };
  const staleRun = {
    conclusion: "success",
    [headShaField]: "old-head",
    name: "ci.yml",
    status: "completed",
  };
  assert.deepEqual(normalizeCheckRun(queuedRun, "head-1"), { bucket: "pending", name: "ci.yml", state: "QUEUED" });
  assert.deepEqual(normalizeCheckRun(failedRun, "head-1"), { bucket: "fail", name: "ci.yml", state: "FAILURE" });
  assert.deepEqual(normalizeCheckRun(staleRun, "head-1"), { bucket: "unknown", name: "ci.yml", state: "STALE_HEAD" });
});

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

test("fails closed for wrong providers, stale heads, and failed statuses", () => {
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
      { contexts: ["build-test"] },
      [],
      [{ context: "build-test", sha: "head-1", state: "failure" }],
      "head-1",
    ),
    [{ bucket: "fail", name: "build-test", state: "FAILURE" }],
  );
});

function protectedRun(id, conclusion, status = "completed", appId = 15_368) {
  const run = { app: { id: appId }, conclusion, head_sha: "head-1", name: "build-test", status };
  return id === undefined ? run : { id, ...run };
}

function settle(protection, runs, statuses = []) {
  return normalizeRequiredChecks(protection, runs, statuses, "head-1");
}

test("settles repeated exact-head runs of one required check by the newest check-run id", () => {
  const expectedApp = { checks: [{ context: "build-test", app_id: 15_368 }] };
  assert.deepEqual(settle(expectedApp, [protectedRun(101, "success"), protectedRun(102, "success")]), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
  ]);
  assert.deepEqual(settle(expectedApp, [protectedRun(101, "failure"), protectedRun(102, "success")]), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
  ]);
  assert.deepEqual(settle(expectedApp, [protectedRun(101, "success"), protectedRun(102, "failure")]), [
    { bucket: "fail", name: "build-test", state: "FAILURE" },
  ]);
  assert.deepEqual(settle(expectedApp, [protectedRun(101, "success"), protectedRun(102, null, "in_progress")]), [
    { bucket: "pending", name: "build-test", state: "IN_PROGRESS" },
  ]);
  assert.deepEqual(settle(expectedApp, [protectedRun(202, "success"), protectedRun(201, "failure")]), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
  ]);
  assert.deepEqual(
    settle(expectedApp, [protectedRun(101, "success"), protectedRun(102, "success"), protectedRun(103, "cancelled")]),
    [{ bucket: "fail", name: "build-test", state: "CANCELLED" }],
  );
});

test("settles unordered repeated runs only when they agree", () => {
  const expectedApp = { checks: [{ context: "build-test", app_id: 15_368 }] };
  assert.deepEqual(settle(expectedApp, [protectedRun(undefined, "success"), protectedRun(undefined, "success")]), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
  ]);
  assert.deepEqual(settle(expectedApp, [protectedRun(101, "success"), protectedRun(undefined, "failure")]), [
    { bucket: "unknown", name: "build-test", state: "DUPLICATE" },
  ]);
  assert.deepEqual(settle(expectedApp, [protectedRun(101, "success"), protectedRun(101, "failure")]), [
    { bucket: "unknown", name: "build-test", state: "DUPLICATE" },
  ]);
});

test("keeps provider, stale-head, and status verdicts ahead of the newest-run rule", () => {
  const expectedApp = { checks: [{ context: "build-test", app_id: 15_368 }] };
  assert.deepEqual(
    settle(expectedApp, [protectedRun(101, "success"), protectedRun(102, "success", "completed", 57_789)]),
    [{ bucket: "unknown", name: "build-test", state: "PROVIDER_CONFLICT" }],
  );
  assert.deepEqual(
    settle(expectedApp, [
      protectedRun(101, "success", "completed", 57_789),
      protectedRun(102, "success", "completed", 57_789),
    ]),
    [{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }],
  );
  assert.deepEqual(
    settle(expectedApp, [
      { ...protectedRun(101, "success"), head_sha: "old-head" },
      { ...protectedRun(102, "success"), head_sha: "old-head" },
    ]),
    [{ bucket: "unknown", name: "build-test", state: "STALE_HEAD" }],
  );
  const anyApp = { checks: [{ context: "build-test", app_id: -1 }] };
  assert.deepEqual(settle(anyApp, [protectedRun(101, "failure"), protectedRun(102, "success")]), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
  ]);
  assert.deepEqual(settle(anyApp, [protectedRun(101, "success"), protectedRun(102, "success", "completed", 57_789)]), [
    { bucket: "unknown", name: "build-test", state: "PROVIDER_CONFLICT" },
  ]);
  const contextsOnly = { contexts: ["build-test"] };
  assert.deepEqual(
    settle(contextsOnly, [
      { id: 101, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
      { id: 102, conclusion: "success", head_sha: "head-1", name: "build-test", status: "completed" },
    ]),
    [{ bucket: "unknown", name: "build-test", state: "PROVIDER_CONFLICT" }],
  );
  assert.deepEqual(
    settle(
      contextsOnly,
      [protectedRun(101, "success"), protectedRun(102, "success")],
      [{ context: "build-test", sha: "head-1", state: "success" }],
    ),
    [{ bucket: "unknown", name: "build-test", state: "DUPLICATE" }],
  );
  assert.deepEqual(
    settle(
      contextsOnly,
      [],
      [
        { context: "build-test", sha: "head-1", state: "success" },
        { context: "build-test", sha: "head-1", state: "success" },
      ],
    ),
    [{ bucket: "unknown", name: "build-test", state: "DUPLICATE" }],
  );
});

test("covers missing, pending, provider-conflict, duplicate-source, and terminal boundaries", () => {
  const protectedCheck = { checks: [{ context: "build-test", app_id: 15_368 }] };
  assert.deepEqual(normalizeRequiredChecks(protectedCheck, [], [], "head-1"), [
    { bucket: "unknown", name: "build-test", state: "MISSING" },
  ]);
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

// Answers the three REST required-check reads for head-1 by endpoint and fails any other command,
// so an unexpected read stops at the call that made it.
function restRunner(calls, { protection, checkRuns, statuses }) {
  const responses = new Map([
    ["repos/owner/repo/branches/master/protection/required_status_checks", protection],
    ["repos/owner/repo/commits/head-1/check-runs?per_page=100", checkRuns],
    ["repos/owner/repo/commits/head-1/status?per_page=100", statuses],
  ]);
  return (args) => {
    calls.push(args);
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    if (!responses.has(endpoint)) {
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    }
    return { stderr: "", status: 0, stdout: JSON.stringify(responses.get(endpoint)) };
  };
}

test("reads protected exact-head checks through REST only", () => {
  const calls = [];
  const checkRun = {
    app: { id: 15_368 },
    conclusion: "success",
    head_sha: "head-1",
    name: "build-test",
    status: "completed",
  };
  const commandRunner = restRunner(calls, {
    protection: { checks: [{ app_id: 15_368, context: "build-test" }] },
    checkRuns: { check_runs: [checkRun] },
    statuses: { statuses: [] },
  });

  const checks = new GitHubClient("owner/repo", 24, commandRunner).getRequiredChecks({
    baseBranch: "master",
    headSha: "head-1",
  });

  assert.deepEqual(checks, [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
  assert.deepEqual(
    calls.map((args) => args[0]),
    ["api", "api", "api"],
  );
  const checkRunsCall = calls.find((args) => args.some((arg) => arg.includes("check-runs")));
  const statusesCall = calls.find((args) => args.some((arg) => arg.endsWith("/status?per_page=100")));
  assert.ok(checkRunsCall);
  assert.ok(statusesCall);
  assert.ok(checkRunsCall.includes("--paginate"));
  assert.ok(checkRunsCall.some((arg) => /commits\/head-1\/check-runs\?per_page=100$/.test(arg)));
  assert.ok(statusesCall.some((arg) => /commits\/head-1\/status\?per_page=100$/.test(arg)));
});

test("uses the combined-status envelope SHA for status-only requirements", () => {
  const commandRunner = restRunner([], {
    protection: { contexts: ["build-test"] },
    checkRuns: { check_runs: [] },
    statuses: { sha: "head-1", statuses: [{ context: "build-test", state: "success" }] },
  });

  const checks = new GitHubClient("owner/repo", 24, commandRunner).getRequiredChecks({
    baseBranch: "master",
    headSha: "head-1",
  });

  assert.deepEqual(checks, [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
});
