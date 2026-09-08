import type { RelationCapabilities } from "../../semantic/contracts/contract.js";

export function readyCapabilities(): RelationCapabilities {
  return Object.fromEntries(
    "definition,references,type_definition,implementation,callers,callees"
      .split(",")
      .map((name) => [name, { state: "ready" }]),
  ) as RelationCapabilities;
}

export const degradedCapabilities = {
  definition: { state: "unavailable" },
  references: { state: "ready" },
  type_definition: { state: "unavailable" },
  implementation: { state: "unavailable" },
  callers: { state: "unavailable" },
  callees: { state: "unavailable" },
} as never;
