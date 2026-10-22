// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount, listReads, patchedIds, singleItemReads } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS, ITEM_NUMERIC_IDS, STATUS_FIELD_ID } from "./fixtures/project-status-data.mjs";
import { laggingRunner, omitFirst, recordingSleep } from "./fixtures/project-status-lag.mjs";
import { backlogRunner, numericIdOf, writeItems, writeOptions } from "./fixtures/project-status-write.mjs";
import { buildProjectItemReadCommand, PROJECT_ITEM_RETRY_DELAY_MS, writeProjectStatuses } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

// One 404 on the first read, the read that resolves the item, and the readback after the write.
const TRANSIENT_404_RUN_READS = 3;
const NODE_ID_REMEDY_ERROR = /PVTI_child-one was missing from readback\. Pass its numeric item id instead/;

test("AC-01 numeric input writes one PATCH to its numeric endpoint and reports the input as given", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = backlogRunner();

  const result = writeItems([numericId], runner);

  assertPatchCount(calls, 1);
  assert.equal(patchedIds(calls)[0], numericId);
  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done", changed: true }]);
});

test("AC-01 mixed numeric and node inputs PATCH in the given order and report each input as given", () => {
  const itemIds = [numericIdOf(0), numericIdOf(1), ITEM_IDS[2]];
  const { calls, runner } = createRunner();

  const result = writeProjectStatuses({ ...writeOptions({ itemIds }), commandRunner: runner });

  assert.deepEqual(
    patchedIds(calls),
    ITEM_IDS.map((itemId) => String(ITEM_NUMERIC_IDS.get(itemId))),
  );
  assert.deepEqual(
    result.mutations,
    itemIds.map((itemId) => ({ itemId, status: "Done", changed: true })),
  );
});

test("R10 numeric input absent from the items list is written and read back through the single-item endpoint", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = laggingRunner(backlogRunner(), omitFirst());
  const { delays, sleep } = recordingSleep();

  const result = writeItems([numericId], runner, sleep);

  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done", changed: true }]);
  assertPatchCount(calls, 1);
  assert.equal(listReads(calls).length, 0);
  const expectedRead = buildProjectItemReadCommand({
    owner: "TychoHenzen",
    projectNumber: 2,
    itemId: numericId,
    statusFieldId: String(STATUS_FIELD_ID),
  });
  assert.deepEqual(singleItemReads(calls), [expectedRead, expectedRead]);
  assert.deepEqual(delays, []);
});

test("R10 a transient single-item 404 is read again and the write succeeds within the attempt bound", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = laggingRunner(backlogRunner(), { notFoundReads: 1 });
  const { delays, sleep } = recordingSleep();

  const result = writeItems([numericId], runner, sleep);

  assert.deepEqual(result.mutations, [{ itemId: numericId, status: "Done", changed: true }]);
  assertPatchCount(calls, 1);
  assert.equal(singleItemReads(calls).length, TRANSIENT_404_RUN_READS);
  assert.deepEqual(delays, [PROJECT_ITEM_RETRY_DELAY_MS]);
});

test("R11 a node-id input absent from the items list names the numeric-id remedy before any PATCH", () => {
  const { calls, runner } = laggingRunner(backlogRunner(), omitFirst());

  assert.throws(() => writeItems([ITEM_IDS[0]], runner), NODE_ID_REMEDY_ERROR);
  assertPatchCount(calls, 0);
  assert.equal(singleItemReads(calls).length, 0);
});
