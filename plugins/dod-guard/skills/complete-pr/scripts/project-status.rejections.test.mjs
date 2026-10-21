// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS, projectFields } from "./fixtures/project-status-data.mjs";
import { writeFirst, writeOptions } from "./fixtures/project-status-write.mjs";
import { writeProjectStatuses } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const NUMERIC_PROJECT_ID_ERROR = /global ProjectV2 node ID/;
const STATUS_FIELD_ERROR = /exactly one REST field/;

test("rejects a numeric project response before any status write", () => {
  const { calls, runner } = createRunner({ projectId: "2" });

  assert.throws(() => writeFirst(runner), NUMERIC_PROJECT_ID_ERROR);
  assertPatchCount(calls, 0);
});

test("rejects duplicate item IDs before resolving or writing", () => {
  const { calls, runner } = createRunner();
  const itemIds = [ITEM_IDS[0], ITEM_IDS[0], ITEM_IDS[2]];

  assert.throws(() => writeProjectStatuses({ ...writeOptions({ itemIds }), commandRunner: runner }), /unique item IDs/);
  assert.equal(calls.length, 0);
});

test("rejects a missing or mismatched status option before any status write", () => {
  const { calls, runner } = createRunner();

  assert.throws(() => writeFirst(runner, { statusOptionId: "missing-option" }), /must map to Done/);
  assertPatchCount(calls, 0);
});

test("rejects missing or ambiguous REST status fields before any status write", () => {
  for (const fields of [[], [...projectFields(), ...projectFields()]]) {
    const { calls, runner } = createRunner({ fields });

    assert.throws(() => writeFirst(runner), STATUS_FIELD_ERROR);
    assertPatchCount(calls, 0);
  }
});
