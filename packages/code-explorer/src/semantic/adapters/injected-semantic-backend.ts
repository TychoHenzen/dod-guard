import type {
  RelationCapabilities,
  SemanticRequest,
  SemanticResult,
} from "../contracts/contract.js";

export type InjectedSemanticBackend = {
  readiness: () =>
    | { state: "initializing" }
    | { state: "ready" }
    | { state: "degraded" }
    | { state: "refreshing" }
    | { state: "unavailable"; failure_code?: string }
    | { state: "failed"; failure_code: string };
  query: (request: SemanticRequest) => Promise<SemanticResult>;
  start?(signal?: AbortSignal): Promise<void>;
  shutdown?(): Promise<void>;
  refresh?(): Promise<void>;
  capabilities?(): RelationCapabilities;
};
