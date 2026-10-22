// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount, isListRead } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS, STATUS_FIELD_ID } from "./fixtures/project-status-data.mjs";
import { writeFirst } from "./fixtures/project-status-write.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const NODE_ID = ITEM_IDS[0];
const STABLE_ID_MESSAGE = "Project item readback must include stable numeric and global IDs.";
const REMEDY = "Pass its numeric item id instead; the items list can lag behind a newly added item.";

function listing(items) {
  const { calls, runner } = createRunner();
  const replaced = (args) => {
    const result = runner(args);
    return isListRead(args) ? { ...result, stdout: JSON.stringify([items]) } : result;
  };
  return { calls, runner: replaced };
}

test("two listed items for one repository issue stop as a repeated membership before any PATCH", () => {
  const first = { id: 1, node_id: "PVTI_a", content: { repository: { full_name: "Owner/Repo" }, number: 5 } };
  const second = { id: 2, node_id: "PVTI_b", content: { repository: { fullName: "owner/repo" }, number: 5 } };
  const { calls, runner } = listing([first, second]);

  assert.throws(() => writeFirst(runner), {
    message: "Project membership owner/repo#5 appeared more than once in readback.",
  });
  assertPatchCount(calls, 0);
});

test("a listed item without a usable numeric or global ID stops with the stable-ID message", () => {
  const unusable = [
    { id: "  ", node_id: "PVTI_x" },
    { id: 7, node_id: "" },
    { id: null, node_id: "PVTI_x" },
    { node_id: "PVTI_x" },
    { id: 7 },
  ];
  for (const [index, item] of unusable.entries()) {
    const { runner } = listing([item]);

    assert.throws(() => writeFirst(runner), { message: STABLE_ID_MESSAGE }, `case ${index}`);
  }
});

test("a listed item that spells its global ID as nodeId passes validation and is then reported as missing", () => {
  const { runner } = listing([{ id: 7, nodeId: "PVTI_alias" }]);

  assert.throws(() => writeFirst(runner), {
    message: `Project item ${NODE_ID} was missing from readback. ${REMEDY}`,
  });
});

test("a read-back item whose Status field or value is unreadable stops with the matching message", () => {
  const status = { id: STATUS_FIELD_ID, name: "Status", data_type: "single_select" };
  const contradictory = { ...status, value: { name: { raw: "Done", html: "Backlog" } } };
  const identity = { id: 7, node_id: NODE_ID };
  const none = "exactly one Status field/value";
  const unreadable = "one non-contradictory Status field/value";
  const cases = [
    [identity, none],
    [{ ...identity, fields: "none" }, none],
    [{ ...identity, fields: [status] }, unreadable],
    [{ ...identity, fields: [contradictory] }, unreadable],
  ];
  for (const [index, [item, tail]] of cases.entries()) {
    const { runner } = listing([item]);

    assert.throws(
      () => writeFirst(runner),
      { message: `Project item ${NODE_ID} readback did not include ${tail}.` },
      `case ${index}`,
    );
  }
});
