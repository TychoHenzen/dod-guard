// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount, isSingleItemRead, singleItemReads } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS, NOT_FOUND_RESULT } from "./fixtures/project-status-data.mjs";
import { laggingRunner, recordingSleep } from "./fixtures/project-status-lag.mjs";
import { backlogRunner, numericIdOf, writeItems } from "./fixtures/project-status-write.mjs";
import { runGh } from "./lib/gh-runner.mjs";
import { PROJECT_ITEM_READ_ATTEMPTS, PROJECT_ITEM_RETRY_DELAY_MS } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

// Issue #869 clarification C6 fixes the bound at three reads; the constant must
// not drift silently.
const CLARIFIED_READ_ATTEMPTS = 3;
const SERVER_ERROR = /HTTP 502/;
const missingMessage = (id) => `Project item ${id} was missing from readback.`;

test("R11 a single-item 404 on every bounded read stops as missing with no PATCH", () => {
  const numericId = numericIdOf(0);
  const lag = { notFoundReads: PROJECT_ITEM_READ_ATTEMPTS };
  const { calls, runner } = laggingRunner(backlogRunner(), lag);
  const { delays, sleep } = recordingSleep();

  assert.throws(() => writeItems([numericId], runner, sleep), { message: missingMessage(numericId) });
  assert.equal(PROJECT_ITEM_READ_ATTEMPTS, CLARIFIED_READ_ATTEMPTS);
  assert.equal(singleItemReads(calls).length, PROJECT_ITEM_READ_ATTEMPTS);
  assertPatchCount(calls, 0);
  const delay = PROJECT_ITEM_RETRY_DELAY_MS;
  assert.deepEqual(delays, [delay, 2 * delay]);
});

test("R11 a readback that answers 404 on every bounded read after the write stops as missing", () => {
  const numericId = numericIdOf(0);
  const statuses = new Map([[ITEM_IDS[0], "Backlog"]]);
  const { calls, runner } = createRunner({ statuses });
  const vanishingRunner = (args) => {
    const result = runner(args);
    if (args.includes("PATCH")) {
      statuses.delete(ITEM_IDS[0]);
    }
    return result;
  };
  const { sleep } = recordingSleep();

  assert.throws(() => writeItems([numericId], vanishingRunner, sleep), { message: missingMessage(numericId) });
  assertPatchCount(calls, 1);
  assert.equal(singleItemReads(calls).length, 1 + PROJECT_ITEM_READ_ATTEMPTS);
});

// The fakes above ignore the accepted exit codes; the real runner throws on any
// exit it was not told to accept, so this pins that a 404 reaches the retry
// instead of escaping as gh's raw text.
test("R11 a 404 through the real gh runner is retried to the bound and stops as missing", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = backlogRunner();
  const notFoundSpawn = () => NOT_FOUND_RESULT;
  const ghRunner = (args, acceptedExitCodes) => {
    if (isSingleItemRead(args)) {
      calls.push(args);
      return runGh(args, acceptedExitCodes, notFoundSpawn);
    }
    return runner(args);
  };
  const { sleep } = recordingSleep();

  assert.throws(() => writeItems([numericId], ghRunner, sleep), { message: missingMessage(numericId) });
  assert.equal(singleItemReads(calls).length, PROJECT_ITEM_READ_ATTEMPTS);
  assertPatchCount(calls, 0);
});

test("R11 a non-404 single-item failure stops at once without another read or a PATCH", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = backlogRunner();
  const failingRunner = (args) => {
    if (isSingleItemRead(args)) {
      calls.push(args);
      return { status: 1, stderr: "gh: Server Error (HTTP 502)", stdout: "" };
    }
    return runner(args);
  };
  const { delays, sleep } = recordingSleep();

  const write = () => writeItems([numericId], failingRunner, sleep);
  assert.throws(write, SERVER_ERROR);
  assert.equal(singleItemReads(calls).length, 1);
  assertPatchCount(calls, 0);
  assert.deepEqual(delays, []);
});
