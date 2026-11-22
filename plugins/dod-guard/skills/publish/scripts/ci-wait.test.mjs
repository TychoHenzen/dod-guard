import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForChecks } from "./ci-wait.mjs";
import { checkRun, checks, fakeGh, REPOSITORY, SHA } from "./harness/ci-wait-support.mjs";

function waitWith(gh, overrides) {
  return waitForChecks({
    repository: REPOSITORY,
    sha: SHA,
    required: [],
    gh,
    sleep: async () => {},
    print: () => {},
    ...overrides,
  });
}

test("waitForChecks polls again after pending, sleeps interval*1000 between attempts, then passes", async () => {
  const { gh, calls } = fakeGh([checks([checkRun(1, "queued")]), checks([checkRun(1, "completed", "success")])]);
  const sleeps = [];
  const verdict = await waitWith(gh, { attempts: 3, intervalSeconds: 2, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(verdict.state, "passed");
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [2000]);
});

test("waitForChecks returns pending after the last attempt with no trailing sleep (2 attempts, 1 sleep)", async () => {
  const { gh } = fakeGh([checks([checkRun(1, "queued")]), checks([checkRun(1, "in_progress")])]);
  const sleeps = [];
  const verdict = await waitWith(gh, { attempts: 2, intervalSeconds: 1, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(verdict.state, "pending");
  assert.deepEqual(sleeps, [1000]);
});

test("waitForChecks reads repos/<repository>/commits/<sha>/check-runs?per_page=100 through gh api", async () => {
  const { gh, calls } = fakeGh([checks([checkRun(1, "completed", "success")])]);
  await waitWith(gh, { attempts: 1, intervalSeconds: 0 });
  assert.deepEqual(calls, [["api", `repos/${REPOSITORY}/commits/${SHA}/check-runs?per_page=100`]]);
});
