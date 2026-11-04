import assert from "node:assert/strict";
import { test } from "node:test";
import { EXIT, judge, main, newestPerName, parseArguments, waitForChecks } from "./ci-wait.mjs";

const SHA = "a".repeat(40);
const REPOSITORY = "TychoHenzen/dod-guard";

function checks(list) {
  return JSON.stringify({ check_runs: list });
}

function fakeGh(responses) {
  const calls = [];
  const gh = async (args) => {
    calls.push(args);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { gh, calls };
}

test("judge reports passed when every check completed with success, skipped, or neutral", () => {
  const verdict = judge([
    { id: 1, name: "build-test", status: "completed", conclusion: "success" },
    { id: 2, name: "plugin-config", status: "completed", conclusion: "skipped" },
    { id: 3, name: "static-analysis", status: "completed", conclusion: "neutral" },
  ]);
  assert.equal(verdict.state, "passed");
  assert.deepEqual(verdict.failed, []);
});

test("judge reports failed and names each failed check even while another check is still running", () => {
  const verdict = judge([
    { id: 1, name: "build-test", status: "completed", conclusion: "failure" },
    { id: 2, name: "plugin-config", status: "in_progress", conclusion: null },
  ]);
  assert.equal(verdict.state, "failed");
  assert.deepEqual(verdict.failed, ["build-test"]);
});

test("judge reports pending when a check is queued or in progress", () => {
  const queued = judge([{ id: 1, name: "build-test", status: "queued", conclusion: null }]);
  const running = judge([{ id: 2, name: "build-test", status: "in_progress", conclusion: null }]);
  assert.equal(queued.state, "pending");
  assert.equal(running.state, "pending");
});

test('judge reports pending when a required check has not started and prints "not started" for it', () => {
  const verdict = judge(
    [{ id: 1, name: "build-test", status: "completed", conclusion: "success" }],
    ["build-test", "plugin-config"],
  );
  assert.equal(verdict.state, "pending");
  assert.ok(verdict.lines.includes("plugin-config: not started"));
});

test("judge reports pending when there are no check runs at all", () => {
  const verdict = judge([]);
  assert.equal(verdict.state, "pending");
});

test("newestPerName keeps the highest id when a re-run repeats a name, so a stale failure is superseded by the newer success", () => {
  const latest = newestPerName([
    { id: 1, name: "build-test", status: "completed", conclusion: "failure" },
    { id: 5, name: "build-test", status: "completed", conclusion: "success" },
  ]);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].id, 5);
  assert.equal(
    judge([
      { id: 1, name: "build-test", status: "completed", conclusion: "failure" },
      { id: 5, name: "build-test", status: "completed", conclusion: "success" },
    ]).state,
    "passed",
  );
});

test("waitForChecks polls again after a pending read, sleeps interval*1000 between attempts, and returns passed on the second read", async () => {
  const { gh, calls } = fakeGh([
    checks([{ id: 1, name: "build-test", status: "queued", conclusion: null }]),
    checks([{ id: 1, name: "build-test", status: "completed", conclusion: "success" }]),
  ]);
  const sleeps = [];
  const printed = [];
  const verdict = await waitForChecks({
    repository: REPOSITORY,
    sha: SHA,
    required: [],
    attempts: 3,
    intervalSeconds: 2,
    gh,
    sleep: async (ms) => sleeps.push(ms),
    print: (line) => printed.push(line),
  });
  assert.equal(verdict.state, "passed");
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [2000]);
});

test("waitForChecks returns pending after the last attempt without a trailing sleep (attempts=2 gives one sleep)", async () => {
  const { gh } = fakeGh([
    checks([{ id: 1, name: "build-test", status: "queued", conclusion: null }]),
    checks([{ id: 1, name: "build-test", status: "in_progress", conclusion: null }]),
  ]);
  const sleeps = [];
  const verdict = await waitForChecks({
    repository: REPOSITORY,
    sha: SHA,
    required: [],
    attempts: 2,
    intervalSeconds: 1,
    gh,
    sleep: async (ms) => sleeps.push(ms),
    print: () => {},
  });
  assert.equal(verdict.state, "pending");
  assert.deepEqual(sleeps, [1000]);
});

test("waitForChecks reads repos/<repository>/commits/<sha>/check-runs?per_page=100 through gh api", async () => {
  const { gh, calls } = fakeGh([checks([{ id: 1, name: "build-test", status: "completed", conclusion: "success" }])]);
  await waitForChecks({
    repository: REPOSITORY,
    sha: SHA,
    required: [],
    attempts: 1,
    intervalSeconds: 0,
    gh,
    sleep: async () => {},
    print: () => {},
  });
  assert.deepEqual(calls, [["api", `repos/${REPOSITORY}/commits/${SHA}/check-runs?per_page=100`]]);
});

test('main returns 0 for passed, 1 for failed (prints "FAILED: build-test"), 2 for pending (prints "PENDING"), and 3 with a usage line for a missing --sha', async () => {
  const run = async (responses, argv) => {
    const { gh } = fakeGh(responses);
    const printed = [];
    const code = await main(argv, { gh, sleep: async () => {}, print: (line) => printed.push(line) });
    return { code, printed };
  };
  const base = [`--repository=${REPOSITORY}`, `--sha=${SHA}`, "--attempts=1"];

  const passed = await run([checks([{ id: 1, name: "build-test", status: "completed", conclusion: "success" }])], base);
  assert.equal(passed.code, EXIT.passed);
  assert.equal(passed.code, 0);
  assert.ok(passed.printed.includes("PASSED"));

  const failed = await run([checks([{ id: 1, name: "build-test", status: "completed", conclusion: "failure" }])], base);
  assert.equal(failed.code, 1);
  assert.ok(failed.printed.includes("FAILED: build-test"));

  const pending = await run([checks([{ id: 1, name: "build-test", status: "in_progress", conclusion: null }])], base);
  assert.equal(pending.code, 2);
  assert.ok(pending.printed.some((line) => line.startsWith("PENDING")));

  const usage = await run([], [`--repository=${REPOSITORY}`, "--attempts=1"]);
  assert.equal(usage.code, 3);
  assert.equal(usage.printed.length, 1);
  assert.ok(usage.printed[0].startsWith("usage: node ci-wait.mjs"));
  assert.ok(usage.printed[0].includes("--sha=<40 hex characters> is required"));
});

test('main returns 3 and prints "read failed" when gh throws', async () => {
  const { gh } = fakeGh([new Error("boom")]);
  const printed = [];
  const code = await main([`--repository=${REPOSITORY}`, `--sha=${SHA}`, "--attempts=1"], {
    gh,
    sleep: async () => {},
    print: (line) => printed.push(line),
  });
  assert.equal(code, EXIT.usage);
  assert.equal(code, 3);
  assert.deepEqual(printed, ["read failed: boom"]);
});

test("parseArguments rejects an unknown argument and a non-integer --attempts", () => {
  assert.throws(() => parseArguments(["--bogus=1"]), /unknown argument --bogus=1/);
  assert.throws(
    () => parseArguments([`--repository=${REPOSITORY}`, `--sha=${SHA}`, "--attempts=1.5"]),
    /--attempts must be a positive integer/,
  );
});
