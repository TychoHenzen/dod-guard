// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  buildProjectItemEditCommand,
  writeProjectStatuses,
} from "./project-status.mjs";

const PROJECT_ID = "PVT_projectnode";
const ITEM_IDS = ["PVTI_child-one", "PVTI_child-two", "PVTI_parent"];
const NUMERIC_PROJECT_ID_ERROR = /global ProjectV2 node ID/;
const READBACK_ERROR = /PVTI_child-two.*read back Todo/;

function createRunner({ projectId = PROJECT_ID, statuses = new Map(ITEM_IDS.map((itemId) => [itemId, "Done"])) } = {}) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args[1] === "view") {
      return { status: 0, stderr: "", stdout: JSON.stringify({ id: projectId }) };
    }
    if (args[1] === "item-edit") {
      return { status: 0, stderr: "", stdout: "" };
    }
    if (args[1] === "item-list") {
      return {
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          items: [...statuses].map(([id, status]) => ({ id, status })),
        }),
      };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

test("resolves one global ProjectV2 ID and writes children before the parent with readback", () => {
  const { calls, runner } = createRunner();

  const result = writeProjectStatuses({
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: "PVTSSF_status-field",
    statusOptionId: "98236657",
    expectedStatus: "Done",
    itemIds: ITEM_IDS,
    commandRunner: runner,
  });

  assert.equal(result.projectId, PROJECT_ID);
  assert.deepEqual(result.mutations, ITEM_IDS.map((itemId) => ({ itemId, status: "Done" })));
  assert.deepEqual(calls.filter((args) => args[1] === "item-edit").map((args) => args[3]), ITEM_IDS);
  assert.equal(calls.filter((args) => args[1] === "item-list").length, ITEM_IDS.length);
  for (const args of calls.filter((entry) => entry[1] === "item-edit")) {
    assert.deepEqual(args, buildProjectItemEditCommand({
      itemId: args[3],
      projectId: PROJECT_ID,
      statusFieldId: "PVTSSF_status-field",
      statusOptionId: "98236657",
    }));
  }
  assert.equal(calls.some((args) => args[0] === "git" || args.includes("worktree")), false);
});

test("rejects a numeric Project number as the GraphQL Project ID before any write", () => {
  const { calls, runner } = createRunner({ projectId: "2" });

  assert.throws(() => writeProjectStatuses({
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: "PVTSSF_status",
    statusOptionId: "f75ad846",
    expectedStatus: "Todo",
    itemIds: ["PVTI_parent"],
    commandRunner: runner,
  }), NUMERIC_PROJECT_ID_ERROR);
  assert.equal(calls.some((args) => args[1] === "item-edit"), false);
});

test("stops after a failed item readback and does not write the next item", () => {
  const statuses = new Map([
    [ITEM_IDS[0], "Done"],
    [ITEM_IDS[1], "Todo"],
    [ITEM_IDS[2], "Done"],
  ]);
  const { calls, runner } = createRunner({ statuses });

  assert.throws(() => writeProjectStatuses({
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: "PVTSSF_status",
    statusOptionId: "98236657",
    expectedStatus: "Done",
    itemIds: ITEM_IDS,
    commandRunner: runner,
  }), READBACK_ERROR);
  assert.deepEqual(calls.filter((args) => args[1] === "item-edit").map((args) => args[3]), ITEM_IDS.slice(0, 2));
  assert.equal(calls.filter((args) => args[1] === "item-list").length, 2);
});
