import assert from "node:assert/strict";
import test from "node:test";
import { DELIVERIES, holdOf, recordedSnapshot } from "./closure.test-support.mjs";
import { planClosures } from "./closure-plan.mjs";
import { readMergedRequiredChecks, readRequiredChecks } from "./required-checks.mjs";

// PBI #948 AC-1: a merged pull request shaped like PR #857 (four checks passed, quality-guard never
// ran) goes from the merged reader through the shared queue classifier without an incomplete-checks reason.

const HEAD = "head-857";
const REQUIRED = ["build-test", "plugin-config", "static-analysis", "package-integrity", "quality-guard"];
const INCOMPLETE = "required checks are incomplete or failed";
const EMPTY = "required checks missing or empty";

function run(name) {
  return { app: { id: 15_368 }, conclusion: "success", head_sha: HEAD, name, status: "completed" };
}

// A runner whose protection requires every name in REQUIRED and whose head holds runs for `ran` only.
function runnerWithRuns(ran) {
  return (args) => {
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("repos/"));
    if (endpoint.includes("required_status_checks")) {
      const checks = REQUIRED.map((context) => ({ app_id: 15_368, context }));
      return { stderr: "", status: 0, stdout: JSON.stringify({ checks }) };
    }
    if (endpoint.includes("/check-runs?")) {
      return { stderr: "", status: 0, stdout: JSON.stringify({ check_runs: ran.map(run) }) };
    }
    return { stderr: "", status: 0, stdout: JSON.stringify({ statuses: [] }) };
  };
}

function reasonsFor(read, ran) {
  const requiredChecks = read("owner/repo", { baseBranch: "master", headSha: HEAD }, runnerWithRuns(ran));
  const snapshot = recordedSnapshot({ roots: [840] });
  snapshot.pullRequests.find(({ number }) => number === DELIVERIES[840].pull).requiredChecks = requiredChecks;
  const plan = planClosures(snapshot);
  return { plan, reasons: holdOf(plan, 777)?.reasons ?? [] };
}

test("a PR #857 shaped merged pull request is verified, not held for the never-run quality-guard", () => {
  const { plan, reasons } = reasonsFor(readMergedRequiredChecks, REQUIRED.slice(0, 4));
  assert.deepEqual(reasons, []);
  assert.equal(plan.deliveries[0].status, "verified");
});

test("the live reader on the same head still holds the delivery as incomplete", () => {
  const { reasons } = reasonsFor(readRequiredChecks, REQUIRED.slice(0, 4));
  assert.ok(
    reasons.some((reason) => reason.endsWith(INCOMPLETE)),
    JSON.stringify(reasons),
  );
});

test("a merged pull request on which no required check ran stays held as missing or empty", () => {
  const { reasons } = reasonsFor(readMergedRequiredChecks, []);
  assert.ok(
    reasons.some((reason) => reason.endsWith(EMPTY)),
    JSON.stringify(reasons),
  );
});
