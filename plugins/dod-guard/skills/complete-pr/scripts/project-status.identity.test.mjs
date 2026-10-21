// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount, isListRead } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS } from "./fixtures/project-status-data.mjs";
import { alterTargetInLaterReads } from "./fixtures/project-status-lag.mjs";
import { backlogRunner, numericIdOf, writeItems, writeOptions } from "./fixtures/project-status-write.mjs";
import { writeProjectStatuses } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const IDENTITY_SHIFT = 1000;
const IDENTITY_CHANGE_ERROR = /same numeric and global IDs/;
const MISSING_READBACK_ERROR = /missing from readback/;
const INPUT_FORMS = [
  ["numeric", numericIdOf(0)],
  ["node", ITEM_IDS[0]],
];

test("stops when a Project item readback changes the resolved REST item ID", () => {
  const statuses = new Map(ITEM_IDS.map((itemId) => [itemId, "Backlog"]));
  const { calls, runner } = createRunner({ statuses });
  let listReadCount = 0;
  const staleRunner = (args) => {
    const result = runner(args);
    if (isListRead(args) && listReadCount++ > 0) {
      const [page] = JSON.parse(result.stdout);
      page[0].id += IDENTITY_SHIFT;
      return { ...result, stdout: JSON.stringify([page]) };
    }
    return result;
  };

  assert.throws(
    () => writeProjectStatuses({ ...writeOptions({ itemIds: ITEM_IDS.slice(0, 2) }), commandRunner: staleRunner }),
    IDENTITY_CHANGE_ERROR,
  );
  assertPatchCount(calls, 1);
});

test("AC-02 numeric and node spellings of one item stop before any PATCH and name both inputs", () => {
  const numericId = numericIdOf(0);
  const { calls, runner } = backlogRunner();

  assert.throws(
    () => writeItems([numericId, ITEM_IDS[0]], runner),
    new RegExp(`${numericId} and ${ITEM_IDS[0]} resolve to the same Project item`),
  );
  assertPatchCount(calls, 0);
});

test("AC-02 identity change after the write stops for every input form and changed ID", () => {
  const changes = [
    ["numeric ID", (item) => ({ ...item, id: item.id + IDENTITY_SHIFT })],
    ["node ID", (item) => ({ ...item, node_id: "PVTI_replaced" })],
  ];
  for (const [inputForm, itemId] of INPUT_FORMS) {
    for (const [changedId, alterItem] of changes) {
      const label = `${inputForm} input, ${changedId} changed`;
      const { calls, runner } = backlogRunner();

      assert.throws(
        () => writeItems([itemId], alterTargetInLaterReads(runner, alterItem)),
        IDENTITY_CHANGE_ERROR,
        label,
      );
      assertPatchCount(calls, 1, label);
    }
  }
});

test("AC-02 readback with both IDs changed after the write stops as missing after one PATCH", () => {
  const bothChanged = (item) => ({ ...item, id: item.id + IDENTITY_SHIFT, node_id: "PVTI_replaced" });
  for (const [inputForm, itemId] of INPUT_FORMS) {
    const label = `${inputForm} input, both IDs changed`;
    const { calls, runner } = backlogRunner();

    assert.throws(
      () => writeItems([itemId], alterTargetInLaterReads(runner, bothChanged)),
      MISSING_READBACK_ERROR,
      label,
    );
    assertPatchCount(calls, 1, label);
  }
});
