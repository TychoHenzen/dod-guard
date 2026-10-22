import { findProjectItem, findReadbackProjectItem, isNumericItemId } from "./project-item-identity.mjs";
import { missingItemError, readSingleProjectItem } from "./project-item-single-read.mjs";
import { validateProjectItems } from "./project-item-validation.mjs";
import { buildProjectItemListCommand } from "./project-status-commands.mjs";
import { nameOrNull, parseArrayResponse } from "./project-status-fields.mjs";

function isStatusField(field, statusFieldId) {
  return String(field?.id ?? "") === String(statusFieldId) || field?.name === "Status";
}

function statusFieldsOf(item, statusFieldId) {
  const fields = Array.isArray(item?.fields) ? item.fields : [];
  return fields.filter((field) => isStatusField(field, statusFieldId));
}

function readProjectItemStatus(item, itemId, statusFieldId) {
  const statusFields = statusFieldsOf(item, statusFieldId);
  if (statusFields.length !== 1) {
    throw new Error(`Project item ${itemId} readback did not include exactly one Status field/value.`);
  }
  const name = nameOrNull(statusFields[0].value);
  if (name === null) {
    throw new Error(`Project item ${itemId} readback did not include one non-contradictory Status field/value.`);
  }
  return name;
}

function readProjectItems(listRead) {
  const { owner, projectNumber, statusFieldId, commandRunner } = listRead;
  const fieldId = statusFieldId;
  const command = buildProjectItemListCommand(owner, projectNumber, fieldId);
  const reply = commandRunner(command);
  const items = parseArrayResponse(reply, "Project item readback");
  return validateProjectItems(items);
}

// A numeric input is read through the single-item endpoint, which sees a new
// item before the list does. A node id can only be found in the list, and one
// list page can reach megabytes, so a run with numeric inputs alone never reads
// it.
function projectItemReads({ itemIds, sleep, ...listRead }) {
  const singleRead = { ...listRead, sleep };
  const readSingle = (itemId) => readSingleProjectItem({ ...singleRead, itemId });
  let listItems = [];
  if (!itemIds.every(isNumericItemId)) {
    listItems = readProjectItems(listRead);
  }
  const reads = { listItems, listRead, readSingle };
  return {
    resolveTarget: (itemId) => resolveReadTarget(reads, itemId),
    readBack: (itemId, identity) => readBackItem(reads, itemId, identity),
  };
}

function resolveReadTarget({ listItems, readSingle }, itemId) {
  if (!isNumericItemId(itemId)) {
    return findProjectItem(listItems, itemId);
  }
  const item = readSingle(itemId);
  if (item === null) {
    return null;
  }
  return findProjectItem([item], itemId);
}

function readBackItem({ listRead, readSingle }, itemId, identity) {
  if (!isNumericItemId(itemId)) {
    const listed = readProjectItems(listRead);
    return findReadbackProjectItem(listed, itemId, identity);
  }
  const item = readSingle(identity.id);
  if (item === null) {
    throw missingItemError(itemId);
  }
  return findReadbackProjectItem([item], itemId, identity);
}

export { projectItemReads, readProjectItemStatus };
