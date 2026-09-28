// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  buildProjectItemEditCommand,
  writeProjectStatuses,
} from "./project-status.mjs";

const PROJECT_ID = "PVT_projectnode";
const STATUS_FIELD_NODE_ID = "PVTSSF_status-field";
const STATUS_FIELD_ID = 407767889;
const STATUS_OPTION_ID = "98236657";
const ITEM_IDS = ["PVTI_child-one", "PVTI_child-two", "PVTI_parent"];
const ITEM_NUMERIC_IDS = new Map(ITEM_IDS.map((itemId, index) => [itemId, 256202820 + index]));
const NUMERIC_PROJECT_ID_ERROR = /global ProjectV2 node ID/;
const STATUS_FIELD_ERROR = /exactly one REST field/;
const READBACK_ERROR = /PVTI_child-two.*read back Todo/;

function projectFields() {
  return [{
    id: STATUS_FIELD_ID,
    node_id: STATUS_FIELD_NODE_ID,
    name: "Status",
    data_type: "single_select",
    options: [
      { id: "30a230f4", name: { raw: "Backlog" } },
      { id: "f75ad846", name: { raw: "Todo" } },
      { id: "47fc9ee4", name: { raw: "In Progress" } },
      { id: STATUS_OPTION_ID, name: { raw: "Done" } },
    ],
  }];
}

function projectItems(statuses) {
  return [...statuses].map(([nodeId, status]) => ({
    id: ITEM_NUMERIC_IDS.get(nodeId),
    node_id: nodeId,
    fields: [{
      id: STATUS_FIELD_ID,
      name: "Status",
      data_type: "single_select",
      value: { id: STATUS_OPTION_ID, name: { raw: status } },
    }],
  }));
}

function createRunner({ projectId = PROJECT_ID, statuses = new Map(ITEM_IDS.map((itemId) => [itemId, "Done"])), splitItems = false, fields = projectFields() } = {}) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    assert.equal(args[0], "api");
    const endpoint = args.find((value) => typeof value === "string" && value.startsWith("users/"));
    if (endpoint === "users/TychoHenzen/projectsV2/2") {
      return { status: 0, stderr: "", stdout: JSON.stringify({ node_id: projectId }) };
    }
    if (endpoint === "users/TychoHenzen/projectsV2/2/fields?per_page=100") {
      return { status: 0, stderr: "", stdout: JSON.stringify([fields]) };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items?") === true) {
      const items = projectItems(statuses);
      const pages = splitItems ? [items.slice(0, 1), items.slice(1)] : [items];
      return { status: 0, stderr: "", stdout: JSON.stringify(pages) };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items/") === true) {
      return { status: 200, stderr: "", stdout: "" };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

function writeOptions(overrides = {}) {
  return {
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: STATUS_FIELD_NODE_ID,
    statusOptionId: STATUS_OPTION_ID,
    expectedStatus: "Done",
    itemIds: ITEM_IDS,
    ...overrides,
  };
}

test("writes REST single-select updates in child-before-parent order with readback", () => {
  const { calls, runner } = createRunner({ splitItems: true });

  const result = writeProjectStatuses({ ...writeOptions(), commandRunner: runner });

  assert.equal(result.projectId, PROJECT_ID);
  assert.deepEqual(result.mutations, ITEM_IDS.map((itemId) => ({ itemId, status: "Done" })));
  assert.deepEqual(
    calls.filter((args) => args.includes("PATCH")).map((args) => args[3].split("/").at(-1)),
    [...ITEM_NUMERIC_IDS.values()].map(String),
  );
  assert.deepEqual(calls.filter((args) => args.includes("PATCH"))[0], buildProjectItemEditCommand({
    owner: "TychoHenzen",
    projectNumber: 2,
    itemId: String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0])),
    statusFieldId: String(STATUS_FIELD_ID),
    statusOptionId: STATUS_OPTION_ID,
  }));
  assert.equal(calls.filter((args) => args.some((value) => String(value).includes("/items?"))).length, ITEM_IDS.length + 1);
  assert.equal(calls.every((args) => args[0] === "api"), true);
  assert.equal(calls.some((args) => args.some((value) => /graphql|project( |$)|item-edit|item-list|issue view/i.test(String(value)))), false);
});

test("maps REST field and option IDs before issuing a PATCH", () => {
  const { calls, runner } = createRunner();

  writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: runner });

  const patch = calls.find((args) => args.includes("PATCH"));
  assert.deepEqual(patch, buildProjectItemEditCommand({
    owner: "TychoHenzen",
    projectNumber: 2,
    itemId: String(ITEM_NUMERIC_IDS.get(ITEM_IDS[0])),
    statusFieldId: String(STATUS_FIELD_ID),
    statusOptionId: STATUS_OPTION_ID,
  }));
});

test("rejects a numeric project response before any status write", () => {
  const { calls, runner } = createRunner({ projectId: "2" });

  assert.throws(() => writeProjectStatuses({ ...writeOptions({ itemIds: [ITEM_IDS[0]] }), commandRunner: runner }), NUMERIC_PROJECT_ID_ERROR);
  assert.equal(calls.some((args) => args.includes("PATCH")), false);
});

test("rejects duplicate item IDs before resolving or writing", () => {
  const { calls, runner } = createRunner();

  assert.throws(() => writeProjectStatuses({
    ...writeOptions({ itemIds: [ITEM_IDS[0], ITEM_IDS[0], ITEM_IDS[2]] }),
    commandRunner: runner,
  }), /unique item IDs/);
  assert.equal(calls.length, 0);
});

test("rejects a missing or mismatched status option before any status write", () => {
  const { calls, runner } = createRunner();

  assert.throws(() => writeProjectStatuses({
    ...writeOptions({ statusOptionId: "missing-option", itemIds: [ITEM_IDS[0]] }),
    commandRunner: runner,
  }), /must map to Done/);
  assert.equal(calls.some((args) => args.includes("PATCH")), false);
});

test("rejects missing or ambiguous REST status fields before any status write", () => {
  for (const fields of [[], [...projectFields(), ...projectFields()]]) {
    const { calls, runner } = createRunner({ fields });

    assert.throws(() => writeProjectStatuses({
      ...writeOptions({ itemIds: [ITEM_IDS[0]] }),
      commandRunner: runner,
    }), STATUS_FIELD_ERROR);
    assert.equal(calls.some((args) => args.includes("PATCH")), false);
  }
});

test("stops after a failed item readback and does not write the next item", () => {
  const statuses = new Map([
    [ITEM_IDS[0], "Done"],
    [ITEM_IDS[1], "Todo"],
    [ITEM_IDS[2], "Done"],
  ]);
  const { calls, runner } = createRunner({ statuses });

  assert.throws(() => writeProjectStatuses({ ...writeOptions(), commandRunner: runner }), READBACK_ERROR);
  assert.deepEqual(
    calls.filter((args) => args.includes("PATCH")).map((args) => args[3].split("/").at(-1)),
    ITEM_IDS.slice(0, 2).map((itemId) => String(ITEM_NUMERIC_IDS.get(itemId))),
  );
  assert.equal(calls.filter((args) => args.some((value) => String(value).includes("/items?"))).length, 3);
});
