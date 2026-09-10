import type { ResponsibilityMap } from "./responsibility-map-types.js";
import {
  desired,
  object,
  onlyKeys,
  responsibility,
  strings,
} from "./responsibility-map-values.js";

export function parseResponsibilityMap(source: string): ResponsibilityMap {
  const parsed = parseJson(source);
  const root = object(parsed, "responsibility map");
  onlyKeys(
    root,
    ["targetScope", "responsibilities", "desired"],
    "responsibility map",
  );
  const targetScope = strings(
    root.targetScope,
    "responsibility map.targetScope",
  );
  if (targetScope.length === 0)
    throw new Error("responsibility map.targetScope must not be empty");
  if (
    !Array.isArray(root.responsibilities) ||
    root.responsibilities.length === 0
  )
    throw new Error(
      "responsibility map.responsibilities must be a non-empty array",
    );
  const responsibilities = root.responsibilities.map(responsibility);
  if (responsibilities.some((item) => item.currentOwners.length === 0))
    throw new Error(
      "responsibility map responsibilities require at least one current owner",
    );
  return { targetScope, responsibilities, desired: desired(root.desired) };
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("responsibility map must contain valid JSON");
  }
}
