function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function requireText(value, name) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function requireProjectNumber(projectNumber) {
  if (projectNumber === undefined || projectNumber === null || String(projectNumber).length === 0) {
    throw new Error("projectNumber must be a non-empty value.");
  }
}

function requireItemIdShape(itemIds) {
  if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every(isNonEmptyString)) {
    throw new Error("itemIds must contain at least one non-empty item ID.");
  }
}

function requireUniqueItemIds(itemIds) {
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("itemIds must contain unique item IDs.");
  }
}

function requireWriteRequest({ owner, projectNumber, statusFieldId, statusOptionId, expectedStatus, itemIds }) {
  requireText(owner, "owner");
  requireProjectNumber(projectNumber);
  requireText(statusFieldId, "statusFieldId");
  requireText(statusOptionId, "statusOptionId");
  requireText(expectedStatus, "expectedStatus");
  requireItemIdShape(itemIds);
  requireUniqueItemIds(itemIds);
}

export { requireProjectNumber, requireText, requireWriteRequest };
