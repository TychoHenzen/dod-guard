export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNullOrString(value) {
  return value === null || typeof value === "string";
}

export function nonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function present(value) {
  return value !== undefined && value !== null;
}
