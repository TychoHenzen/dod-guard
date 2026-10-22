// biome-ignore-all lint/style/useNamingConvention: object keys mirror the GitHub REST field names.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { createRestChecksRunner, exactHeadPullRequest } from "./fixtures/required-checks-runners.mjs";
import { readMergedRequiredChecks, readRequiredChecks } from "./required-checks.mjs";

const twoRequiredChecks = {
  checks: [
    { app_id: 15_368, context: "build-test" },
    { app_id: 15_368, context: "quality-guard" },
  ],
};

function headRun(name, overrides = {}) {
  return { app: { id: 15_368 }, conclusion: "success", head_sha: "head-1", name, status: "completed", ...overrides };
}

// A runner whose head holds exactly the given check runs, for a protection that requires build-test and quality-guard.
function runnerWithRuns(runs) {
  return createRestChecksRunner({
    checkRunResponses: [{ stderr: "", status: 0, stdout: JSON.stringify({ check_runs: runs }) }],
    protection: twoRequiredChecks,
  }).runner;
}

const mergedReader = (runner) => readMergedRequiredChecks("owner/repo", exactHeadPullRequest(), runner);
const liveReader = (runner) => readRequiredChecks("owner/repo", exactHeadPullRequest(), runner);

test("the merged reader drops a never-run required check, the live reader still reports it MISSING", () => {
  const runs = [headRun("build-test")];
  assert.deepEqual(mergedReader(runnerWithRuns(runs)), [{ bucket: "pass", name: "build-test", state: "SUCCESS" }]);
  assert.deepEqual(liveReader(runnerWithRuns(runs)), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
    { bucket: "unknown", name: "quality-guard", state: "MISSING" },
  ]);
});

for (const [label, overrides, expected] of [
  ["failed", { conclusion: "failure" }, { bucket: "fail", name: "build-test", state: "FAILURE" }],
  [
    "pending",
    { status: "in_progress", conclusion: null },
    { bucket: "pending", name: "build-test", state: "IN_PROGRESS" },
  ],
  ["stale-head", { head_sha: "old-head" }, { bucket: "unknown", name: "build-test", state: "STALE_HEAD" }],
  ["wrong-provider", { app: { id: 57_789 } }, { bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }],
]) {
  test(`readMergedRequiredChecks keeps a ${label} entry`, () => {
    assert.deepEqual(mergedReader(runnerWithRuns([headRun("build-test", overrides)])), [expected]);
  });
}

test("readMergedRequiredChecks keeps a DUPLICATE entry for two unordered runs that disagree", () => {
  const runs = [headRun("build-test"), headRun("build-test", { conclusion: "failure" })];
  assert.deepEqual(mergedReader(runnerWithRuns(runs)), [{ bucket: "unknown", name: "build-test", state: "DUPLICATE" }]);
});

test("readMergedRequiredChecks returns an empty list when no required check ran on the head", () => {
  assert.deepEqual(mergedReader(runnerWithRuns([])), []);
});

test("readMergedRequiredChecks reads a required check that later gains a run by that run", () => {
  assert.deepEqual(mergedReader(runnerWithRuns([headRun("build-test"), headRun("quality-guard")])), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
    { bucket: "pass", name: "quality-guard", state: "SUCCESS" },
  ]);
  assert.deepEqual(
    mergedReader(runnerWithRuns([headRun("build-test"), headRun("quality-guard", { conclusion: "failure" })])),
    [
      { bucket: "pass", name: "build-test", state: "SUCCESS" },
      { bucket: "fail", name: "quality-guard", state: "FAILURE" },
    ],
  );
});
