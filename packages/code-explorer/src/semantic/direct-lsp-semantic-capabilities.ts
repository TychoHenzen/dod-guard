import type { RelationCapabilities } from "./contract.js";
import type { DirectLspStatus } from "./direct-lsp.js";

/**
 * Converts initialize capabilities into the shared relation capability shape.
 */
export function relationCapabilitiesFromInitialize(
  status: DirectLspStatus,
): RelationCapabilities {
  const capabilities = status.server_capabilities ?? {};
  const supported = (name: string) =>
    capabilities[name] !== undefined && capabilities[name] !== false;
  return {
    definition: capabilityState(supported("definitionProvider")),
    references: capabilityState(supported("referencesProvider")),
    type_definition: capabilityState(supported("typeDefinitionProvider")),
    implementation: capabilityState(supported("implementationProvider")),
    callers: capabilityState(supported("callHierarchyProvider")),
    callees: capabilityState(supported("callHierarchyProvider")),
  };
}

function capabilityState(supported: boolean): {
  state: "ready" | "unavailable";
} {
  return { state: supported ? "ready" : "unavailable" };
}
