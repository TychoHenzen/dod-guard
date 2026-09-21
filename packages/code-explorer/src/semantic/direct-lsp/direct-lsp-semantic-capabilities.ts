import type { RelationCapabilities } from "../contracts/contract.js";
import type { DirectLspStatus } from "./direct-lsp.js";

/**
 * Converts initialize capabilities into the shared relation capability shape.
 */
export function relationCapabilitiesFromInitialize(
  status: DirectLspStatus,
): RelationCapabilities {
  const capabilities = status.server_capabilities ?? {};
  return {
    definition: capabilityState(capabilities, "definitionProvider"),
    references: capabilityState(capabilities, "referencesProvider"),
    type_definition: capabilityState(capabilities, "typeDefinitionProvider"),
    implementation: capabilityState(capabilities, "implementationProvider"),
    callers: capabilityState(capabilities, "callHierarchyProvider"),
    callees: capabilityState(capabilities, "callHierarchyProvider"),
  };
}

function capabilityState(
  capabilities: Record<string, unknown>,
  name: string,
): {
  state: "ready" | "unavailable";
} {
  return {
    state:
      capabilities[name] !== undefined && capabilities[name] !== false
        ? "ready"
        : "unavailable",
  };
}
