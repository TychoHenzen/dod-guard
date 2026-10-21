import { createRunner } from "../project-status-fixtures.mjs";
import {
  buildProjectItemEditCommand,
  writeProjectStatuses,
} from "../project-status.mjs";
import {
  ITEM_IDS,
  ITEM_NUMERIC_IDS,
  STATUS_FIELD_ID,
  STATUS_FIELD_NODE_ID,
  STATUS_OPTION_ID,
} from "./project-status-data.mjs";

export function numericIdOf(index) {
  return String(ITEM_NUMERIC_IDS.get(ITEM_IDS[index]));
}

export function writeOptions(overrides = {}) {
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

export function writeFirst(commandRunner, overrides = {}) {
  const options = writeOptions({ itemIds: [ITEM_IDS[0]], ...overrides });
  return writeProjectStatuses({ ...options, commandRunner });
}

export function writeItems(itemIds, commandRunner, sleep) {
  const options = writeOptions({ itemIds });
  return writeProjectStatuses({ ...options, commandRunner, sleep });
}

// A runner whose Project holds only the first item, in Backlog.
export function backlogRunner() {
  return createRunner({ statuses: new Map([[ITEM_IDS[0], "Backlog"]]) });
}

export function firstItemEditCommand() {
  return buildProjectItemEditCommand({
    owner: "TychoHenzen",
    projectNumber: 2,
    itemId: numericIdOf(0),
    statusFieldId: String(STATUS_FIELD_ID),
    statusOptionId: STATUS_OPTION_ID,
  });
}
