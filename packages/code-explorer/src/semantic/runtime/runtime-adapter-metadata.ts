import type { LanguageAdapterOptions } from "../adapters/types.js";
import type * as launchTypes from "../backend-launch/types.js";
import type { RelationCapabilities } from "../contracts/contract.js";

type AdapterMetadata = Pick<
  LanguageAdapterOptions,
  | "backend_name"
  | "backend_version"
  | "discovery_source"
  | "unavailable_failure_code"
  | "capabilities"
>;

export function runtimeAdapterMetadata(input: {
  backendName: string;
  prepared: launchTypes.BackendLaunchPreparation;
  capabilities: RelationCapabilities;
}): AdapterMetadata {
  return {
    backend_name: input.backendName,
    backend_version:
      input.prepared.status === "ready" ? input.prepared.version : "unobserved",
    discovery_source: "server_path",
    unavailable_failure_code:
      input.prepared.status === "unavailable"
        ? input.prepared.code
        : "backend_unavailable",
    capabilities: input.capabilities,
  };
}
