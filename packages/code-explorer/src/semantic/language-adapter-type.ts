import type {
  BackendStatus,
  SemanticRequest,
  SemanticResult,
} from "./contract.js";

export type LanguageAdapter = {
  status(): BackendStatus;
  request(request: SemanticRequest): Promise<SemanticResult>;
  start?(signal?: AbortSignal): Promise<void>;
  shutdown?(): Promise<void>;
  refresh?(): Promise<void>;
};
