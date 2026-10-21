// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  assertPaginatedReads,
  assertPatchCount,
  itemListCalls,
  patchCalls,
  patchedIds,
} from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS, ITEM_NUMERIC_IDS, PROJECT_ID } from "./fixtures/project-status-data.mjs";
import { firstItemEditCommand, writeFirst, writeOptions } from "./fixtures/project-status-write.mjs";
import { writeProjectStatuses } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const FORBIDDEN_COMMAND = /graphql|project( |$)|item-edit|item-list|issue view/i;

test("writes REST single-select updates in child-before-parent order with readback", () => {
  const { calls, runner } = createRunner({ splitItems: true });

  const result = writeProjectStatuses({ ...writeOptions(), commandRunner: runner });

  assert.equal(result.projectId, PROJECT_ID);
  assert.deepEqual(
    result.mutations,
    ITEM_IDS.map((itemId) => ({ itemId, status: "Done" })),
  );
  assert.deepEqual(patchedIds(calls), [...ITEM_NUMERIC_IDS.values()].map(String));
  assert.deepEqual(patchCalls(calls)[0], firstItemEditCommand());
  assert.equal(itemListCalls(calls).length, ITEM_IDS.length + 1);
  assert.equal(
    calls.every((args) => args[0] === "api"),
    true,
  );
  assert.equal(
    calls.some((args) => args.some((value) => FORBIDDEN_COMMAND.test(String(value)))),
    false,
  );
  assertPaginatedReads(itemListCalls(calls));
});

test("consumes every Link-paginated item page before resolving target IDs", () => {
  const statuses = new Map(ITEM_IDS.map((itemId) => [itemId, "Done"]));
  const { calls, runner } = createRunner({ statuses, splitItems: true });

  writeProjectStatuses({ ...writeOptions({ itemIds: ITEM_IDS.slice(0, 2) }), commandRunner: runner });

  const itemReads = itemListCalls(calls);
  assert.equal(itemReads.length, 1);
  assertPaginatedReads(itemReads);
});

test("does not PATCH a Project item already at the requested status", () => {
  const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Done"]]) });

  const result = writeFirst(runner);

  assert.deepEqual(result.mutations, [{ itemId: ITEM_IDS[0], status: "Done" }]);
  assertPatchCount(calls, 0);
  assert.equal(itemListCalls(calls).length, 1);
});

test("maps REST field and option IDs before issuing a PATCH", () => {
  const { calls, runner } = createRunner();

  writeFirst(runner);

  assert.deepEqual(patchCalls(calls)[0], firstItemEditCommand());
});
