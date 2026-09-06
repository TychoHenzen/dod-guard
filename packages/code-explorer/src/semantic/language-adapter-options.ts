import type { BackendStatus, RelationCapabilities } from "./contract.js";
import type { InjectedSemanticBackend } from "./injected-semantic-backend.js";

export type LanguageAdapterOptions = {
  backend: InjectedSemanticBackend;
  compatible: boolean;
  backend_name?: string;
  backend_version: string;
  capabilities?: Partial<RelationCapabilities>;
  now?: () => number;
  unavailable_failure_code?: string;
  discovery_source?: BackendStatus["discovery_source"];
};
