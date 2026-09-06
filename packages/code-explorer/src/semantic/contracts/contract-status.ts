import type { RelationCapabilities } from "./contract-capabilities.js";
import type { Language } from "./contract-language.js";

export type BackendStatus = {
  language: Language;
  backend_name: string;
  backend_version: string;
  discovery_source: "injected" | "server_path";
  state:
    | "initializing"
    | "ready"
    | "degraded"
    | "refreshing"
    | "unavailable"
    | "failed";
  capabilities: RelationCapabilities;
  last_transition_time: number;
  failure_code?: string;
};
