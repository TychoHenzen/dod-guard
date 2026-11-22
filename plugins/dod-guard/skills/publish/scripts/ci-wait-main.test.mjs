import assert from "node:assert/strict";
import { test } from "node:test";
import { EXIT, main } from "./ci-wait.mjs";
import { parseArguments } from "./ci-wait-args.mjs";
import { checkRun, checks, fakeGh, REPOSITORY, SHA } from "./harness/ci-wait-support.mjs";

const BASE = [`--repository=${REPOSITORY}`, `--sha=${SHA}`, "--attempts=1"];

async function runMain(responses, argv) {
  const { gh } = fakeGh(responses);
  const printed = [];
  const code = await main(argv, { gh, sleep: async () => {}, print: (line) => printed.push(line) });
  return { code, printed };
}

test("main returns 0 for passed and prints PASSED", async () => {
  const passed = await runMain([checks([checkRun(1, "completed", "success")])], BASE);
  assert.equal(passed.code, EXIT.passed);
  assert.equal(passed.code, 0);
  assert.ok(passed.printed.includes("PASSED"));
});

test('main returns 1 for failed and prints "FAILED: build-test"', async () => {
  const failed = await runMain([checks([checkRun(1, "completed", "failure")])], BASE);
  assert.equal(failed.code, 1);
  assert.ok(failed.printed.includes("FAILED: build-test"));
});

test("main returns 2 for pending and prints PENDING", async () => {
  const pending = await runMain([checks([checkRun(1, "in_progress")])], BASE);
  assert.equal(pending.code, 2);
  assert.ok(pending.printed.some((line) => line.startsWith("PENDING")));
});

test("main returns 3 with a usage line for a missing --sha", async () => {
  const usage = await runMain([], [`--repository=${REPOSITORY}`, "--attempts=1"]);
  assert.equal(usage.code, 3);
  assert.equal(usage.printed.length, 1);
  assert.ok(usage.printed[0].startsWith("usage: node ci-wait.mjs"));
  assert.ok(usage.printed[0].includes("--sha=<40 hex characters> is required"));
});

test('main returns 3 and prints "read failed" when gh throws', async () => {
  const { code, printed } = await runMain([new Error("boom")], BASE);
  assert.equal(code, EXIT.usage);
  assert.equal(code, 3);
  assert.deepEqual(printed, ["read failed: boom"]);
});

test("parseArguments rejects an unknown argument and a non-integer --attempts", () => {
  assert.throws(() => parseArguments(["--bogus=1"]), /unknown argument --bogus=1/);
  assert.throws(() => parseArguments([...BASE.slice(0, 2), "--attempts=1.5"]), /--attempts must be a positive integer/);
});

test("parseArguments reads every flag and rejects a bad interval or repository", () => {
  const options = parseArguments([...BASE, "--interval=0", "--require=a,b,"]);
  assert.deepEqual(options.required, ["a", "b"]);
  assert.equal(options.intervalSeconds, 0);
  assert.throws(() => parseArguments([...BASE, "--interval=x"]), /--interval must be a number of seconds/);
  assert.throws(() => parseArguments([`--sha=${SHA}`]), /--repository=<owner\/name> is required/);
  assert.throws(() => parseArguments(["--constructor=1"]), /unknown argument/);
});
