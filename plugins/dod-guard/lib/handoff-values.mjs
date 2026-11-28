// Value predicates shared by the handoff evidence checks and the carry-forward
// shape checks, and presentFields, which copies only the optional fields a
// source supplies so a row without them keeps its earlier shape.
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isTextList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isText);
}

function presentFields(source, fields) {
  const present = fields.filter((field) => Object.hasOwn(source, field));
  return Object.fromEntries(present.map((field) => [field, source[field]]));
}

export { isPlainObject, isText, isTextList, presentFields };
