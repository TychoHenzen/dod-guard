// Value predicates shared by the handoff evidence checks and the carry-forward shape checks.
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isTextList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isText);
}

export { isPlainObject, isText, isTextList };
