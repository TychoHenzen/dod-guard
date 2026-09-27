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
  assert.deepEqual(calls.map((args) => args[1]), [
    "view",
    "item-edit",
    "item-list",
    "item-edit",
    "item-list",
    "item-edit",
    "item-list",
  ]);
  assert.equal(calls.filter((args) => args[1] === "view").length, 1);
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

test("expands readback until a target beyond the first page is present", () => {
  const targetItemId = "PVTI_far-away";
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args[1] === "view") {
      return { status: 0, stderr: "", stdout: JSON.stringify({ id: PROJECT_ID }) };
    }
    if (args[1] === "item-edit") {
      return { status: 0, stderr: "", stdout: "" };
    }
    if (args[1] === "item-list") {
      const limit = Number(args.at(-1));
      const items = limit >= 2000
        ? [...Array.from({ length: 1000 }, (_, index) => ({ id: `PVTI_item-${index}`, status: "Done" })), { id: targetItemId, status: "Done" }]
        : Array.from({ length: 1000 }, (_, index) => ({ id: `PVTI_item-${index}`, status: "Done" }));
      return { status: 0, stderr: "", stdout: JSON.stringify({ items }) };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  writeProjectStatuses({
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: "PVTSSF_status-field",
    statusOptionId: "98236657",
    expectedStatus: "Done",
    itemIds: [targetItemId],
    commandRunner: runner,
  });

  assert.deepEqual(
    calls.filter((args) => args[1] === "item-list").map((args) => args.at(-1)),
    ["1000", "2000"],
  );
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

test("rejects duplicate item IDs before resolving or writing", () => {
  const { calls, runner } = createRunner();

  assert.throws(() => writeProjectStatuses({
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: "PVTSSF_status",
    statusOptionId: "98236657",
    expectedStatus: "Done",
    itemIds: [ITEM_IDS[0], ITEM_IDS[0], ITEM_IDS[2]],
    commandRunner: runner,
  }), /unique item IDs/);
  assert.equal(calls.length, 0);
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
