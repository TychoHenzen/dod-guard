export const REPOSITORY = "owner/repo";
export const OWNER = "owner";
export const PROJECT_NUMBER = 2;
export const PROJECT_NODE_ID = "PVT_disposable";
export const STATUS_FIELD_NODE_ID = "PVTSSF_status";
export const STATUS_FIELD_ID = 407_767_889;
export const PULL_NUMBER = 670;
export const HEAD_SHA = "head-1";
export const PARENT_NUMBER = 660;
export const CHILD_NUMBERS = [665, 666, 667, 668];
export const ISSUE_NUMBERS = [PARENT_NUMBER, ...CHILD_NUMBERS];
export const ITEM_NODE_IDS = [
  "PVTI_child-665",
  "PVTI_child-666",
  "PVTI_child-667",
  "PVTI_child-668",
  "PVTI_parent",
];
export const ITEM_NUMERIC_IDS = new Map(
  ITEM_NODE_IDS.map((itemId, index) => [itemId, 256_202_820 + index]),
);
export const ITEM_NODE_BY_ISSUE = new Map([
  [665, ITEM_NODE_IDS[0]],
  [666, ITEM_NODE_IDS[1]],
  [667, ITEM_NODE_IDS[2]],
  [668, ITEM_NODE_IDS[3]],
  [660, ITEM_NODE_IDS[4]],
]);
export const STATUS_OPTIONS = [
  { id: "30a230f4", name: "Backlog" },
  { id: "f75ad846", name: "Todo" },
  { id: "47fc9ee4", name: "In Progress" },
  { id: "98236657", name: "Done" },
];
export const ISSUE_LABELS = new Map([
  [660, ["bug", "Prio 1 - Emergency", "Effort 8 - Huge"]],
  [665, ["bug", "Prio 1 - Emergency", "Effort 5 - Large"]],
  [666, ["enhancement", "Prio 1 - Emergency", "Effort 5 - Large"]],
  [667, ["enhancement", "Prio 1 - Emergency", "Effort 5 - Large"]],
  [668, ["bug", "Prio 1 - Emergency", "Effort 3 - Medium"]],
]);

export function issueMarker(number) {
  return `<!-- dod-guard:lifecycle-fixture:${number} -->`;
}
