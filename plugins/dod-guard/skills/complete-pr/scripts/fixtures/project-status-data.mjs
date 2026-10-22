// Shared by the project-status test files and the list-options test.
export const PROJECT_ID = "PVT_projectnode";
export const STATUS_FIELD_NODE_ID = "PVTSSF_status-field";
export const STATUS_FIELD_ID = 407_767_889;
export const STATUS_OPTION_ID = "98236657";
export const ITEM_IDS = ["PVTI_child-one", "PVTI_child-two", "PVTI_parent"];
const FIRST_NUMERIC_ID = 256_202_820;
export const ITEM_NUMERIC_IDS = new Map(
  ITEM_IDS.map((itemId, index) => [itemId, FIRST_NUMERIC_ID + index]),
);
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

function statusFieldValue(status) {
  return {
    id: STATUS_FIELD_ID,
    name: "Status",
    data_type: "single_select",
    value: { id: STATUS_OPTION_ID, name: { raw: status } },
  };
}

export function projectItems(statuses) {
  return [...statuses].map(([nodeId, status]) => ({
    id: ITEM_NUMERIC_IDS.get(nodeId),
    node_id: nodeId,
    fields: [statusFieldValue(status)],
  }));
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
