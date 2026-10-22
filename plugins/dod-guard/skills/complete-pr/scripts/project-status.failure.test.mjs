// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount, itemListCalls, patchedIds } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS } from "./fixtures/project-status-data.mjs";
import { timedOutPatchRunner } from "./fixtures/project-status-lag.mjs";
import { backlogRunner, numericIdOf, writeFirst, writeOptions } from "./fixtures/project-status-write.mjs";
import { writeProjectStatuses } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const READBACK_ERROR = /PVTI_child-two.*read back Todo/;

test("reads back after an ambiguous status write and never retries it", () => {
  const { calls, runner } = backlogRunner();
  const ambiguousRunner = (args) => {
    if (args.includes("PATCH")) {
      runner(args);
      throw new Error("status write timed out");
    }
    return runner(args);
  };

  const result = writeFirst(ambiguousRunner);

  assert.deepEqual(result.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
  assertPatchCount(calls, 1);
});

test("stops after an ambiguous status write lacks the desired readback", () => {
  const fixture = backlogRunner();

  assert.throws(
    () => writeFirst(timedOutPatchRunner(fixture)),
    /status mutation failed.*read back Backlog, expected Done/,
  );
  assertPatchCount(fixture.calls, 1);
});

test("stops after a failed item readback and does not write the next item", () => {
  const statuses = new Map([
    [ITEM_IDS[0], "Done"],
    [ITEM_IDS[1], "Todo"],
    [ITEM_IDS[2], "Done"],
  ]);
  const { calls, runner } = createRunner({ statuses });
  const secondItemId = numericIdOf(1);
  const failedRunner = (args) => {
    const result = runner(args);
    if (args.includes("PATCH") && args.some((value) => String(value).endsWith(secondItemId))) {
      statuses.set(ITEM_IDS[1], "Todo");
    }
    return result;
  };

  assert.throws(() => writeProjectStatuses({ ...writeOptions(), commandRunner: failedRunner }), READBACK_ERROR);
  assert.deepEqual(patchedIds(calls), [secondItemId]);
  assert.equal(itemListCalls(calls).length, 2);
});
