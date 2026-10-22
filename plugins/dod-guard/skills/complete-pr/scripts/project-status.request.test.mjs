// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { STATUS_FIELD_NODE_ID } from "./fixtures/project-status-data.mjs";
import { writeOptions } from "./fixtures/project-status-write.mjs";
import { listStatusOptions, writeProjectStatuses } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const OWNER_MESSAGE = "owner must be a non-empty string.";
const PROJECT_NUMBER_MESSAGE = "projectNumber must be a non-empty value.";
const FIELD_ID_MESSAGE = "statusFieldId must be a non-empty string.";
const OPTION_ID_MESSAGE = "statusOptionId must be a non-empty string.";
const ITEM_IDS_MESSAGE = "itemIds must contain at least one non-empty item ID.";
const WRITE_CASES = [
  [{ owner: "" }, OWNER_MESSAGE],
  [{ owner: 5 }, OWNER_MESSAGE],
  [{ projectNumber: "" }, PROJECT_NUMBER_MESSAGE],
  [{ projectNumber: null }, PROJECT_NUMBER_MESSAGE],
  [{ projectNumber: undefined }, PROJECT_NUMBER_MESSAGE],
  [{ statusFieldId: "" }, FIELD_ID_MESSAGE],
  [{ statusOptionId: "" }, OPTION_ID_MESSAGE],
  [{ expectedStatus: "" }, "expectedStatus must be a non-empty string."],
  [{ itemIds: [] }, ITEM_IDS_MESSAGE],
  [{ itemIds: [""] }, ITEM_IDS_MESSAGE],
  [{ itemIds: [7] }, ITEM_IDS_MESSAGE],
  [{ itemIds: "PVTI_child-one" }, ITEM_IDS_MESSAGE],
  [{ itemIds: undefined }, ITEM_IDS_MESSAGE],
  [{ owner: "", projectNumber: "", itemIds: [] }, OWNER_MESSAGE],
  [{ statusOptionId: "", expectedStatus: "", itemIds: [] }, OPTION_ID_MESSAGE],
];

test("rejects each invalid write request field with its own message and runs no command", () => {
  for (const [index, [overrides, message]] of WRITE_CASES.entries()) {
    const { calls, runner } = createRunner();

    assert.throws(
      () => writeProjectStatuses({ ...writeOptions(overrides), commandRunner: runner }),
      { message },
      `case ${index}`,
    );
    assert.equal(calls.length, 0, `case ${index}`);
  }
});

test("listStatusOptions rejects an empty owner, project number, or field id and runs no command", () => {
  const base = { owner: "TychoHenzen", projectNumber: 2, statusFieldId: STATUS_FIELD_NODE_ID };
  const cases = [
    [{ owner: "" }, OWNER_MESSAGE],
    [{ projectNumber: "" }, PROJECT_NUMBER_MESSAGE],
    [{ statusFieldId: "" }, FIELD_ID_MESSAGE],
  ];
  for (const [overrides, message] of cases) {
    const { calls, runner } = createRunner();

    assert.throws(() => listStatusOptions({ ...base, ...overrides, commandRunner: runner }), { message });
    assert.equal(calls.length, 0);
  }
});
