import { Buffer } from "node:buffer";
import type { ResourceLimit } from "./resource-limit.js";
import {
  MAX_FILTER_VALUE_BYTES,
  MAX_FILTER_VALUES,
} from "./resource-limit-constants.js";

export function filterLimit(
  arguments_: Record<string, unknown>,
): ResourceLimit | undefined {
  const filters = [
    arguments_.path_globs,
    arguments_.languages,
    arguments_.kinds,
  ].flatMap((value) => (Array.isArray(value) ? value : []));
  if (filters.length > MAX_FILTER_VALUES)
    return {
      field: "filters",
      limit: MAX_FILTER_VALUES,
      actual: filters.length,
    };
  for (const value of filters) {
    const result = filterValueLimit(value);
    if (result) return result;
  }
  return undefined;
}

function filterValueLimit(value: unknown): ResourceLimit | undefined {
  if (typeof value !== "string") return undefined;
  const actual = Buffer.byteLength(value, "utf8");
  if (actual > MAX_FILTER_VALUE_BYTES)
    return { field: "filter_value", limit: MAX_FILTER_VALUE_BYTES, actual };
  return undefined;
}
