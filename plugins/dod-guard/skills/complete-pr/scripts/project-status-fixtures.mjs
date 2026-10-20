import assert from "node:assert/strict";

// Shared by project-status.test.mjs and project-status-list-options.test.mjs.
export const PROJECT_ID = "PVT_projectnode";
export const STATUS_FIELD_NODE_ID = "PVTSSF_status-field";
export const STATUS_FIELD_ID = 407_767_889;
export const STATUS_OPTION_ID = "98236657";
export const ITEM_IDS = ["PVTI_child-one", "PVTI_child-two", "PVTI_parent"];
export const ITEM_NUMERIC_IDS = new Map(ITEM_IDS.map((itemId, index) => [itemId, 256_202_820 + index]));
export const ITEM_LIST_PREFIX = "users/TychoHenzen/projectsV2/2/items?";
export const ITEM_READ_PREFIX = "users/TychoHenzen/projectsV2/2/items/";
// The stderr gh prints for a REST 404, as the live read of a missing item
// returned on 2026-10-14.
export const NOT_FOUND_RESULT = {
  status: 1,
  stderr: "gh: Not Found (HTTP 404)",
  stdout: "",
};

export function projectFields() {
  return [
    {
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
    },
  ];
}

export function projectItems(statuses) {
  return [...statuses].map(([nodeId, status]) => ({
    id: ITEM_NUMERIC_IDS.get(nodeId),
    node_id: nodeId,
    fields: [
      {
        id: STATUS_FIELD_ID,
        name: "Status",
        data_type: "single_select",
        value: { id: STATUS_OPTION_ID, name: { raw: status } },
      },
    ],
  }));
}

export function createRunner({
  projectId = PROJECT_ID,
  statuses = new Map(ITEM_IDS.map((itemId) => [itemId, "Backlog"])),
  splitItems = false,
  fields = projectFields(),
} = {}) {
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
    if (endpoint?.startsWith(ITEM_LIST_PREFIX) === true) {
      const items = projectItems(statuses);
      const pages = splitItems ? [items.slice(0, 1), items.slice(1)] : [items];
      return { status: 0, stderr: "", stdout: JSON.stringify(pages) };
    }
    if (endpoint?.startsWith("users/TychoHenzen/projectsV2/2/items/") === true && args.includes("PATCH")) {
      const itemId = [...ITEM_NUMERIC_IDS.entries()].find(([, numericId]) => endpoint.endsWith(String(numericId)))?.[0];
      const statusOptionId = args.find((value) => String(value).startsWith("fields[][value]="))?.split("=", 2)[1];
      const status = projectFields()[0].options.find((option) => option.id === statusOptionId)?.name.raw;
      statuses.set(itemId, status);
      return { status: 0, stderr: "", stdout: "" };
    }
    if (endpoint?.startsWith(ITEM_READ_PREFIX) === true) {
      return singleItemReply(statuses, endpoint);
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

export function singleItemReply(statuses, endpoint) {
  const [numericId] = endpoint.slice(ITEM_READ_PREFIX.length).split("?", 1);
  const entries = [...ITEM_NUMERIC_IDS.entries()];
  const nodeId = entries.find(([, id]) => String(id) === numericId)?.[0];
  if (!statuses.has(nodeId)) {
    return NOT_FOUND_RESULT;
  }
  const [item] = projectItems(new Map([[nodeId, statuses.get(nodeId)]]));
  return { status: 0, stderr: "", stdout: JSON.stringify(item) };
}

export function listReads(calls) {
  const isList = (value) => String(value).startsWith(ITEM_LIST_PREFIX);
  return calls.filter((args) => args.some(isList));
}
