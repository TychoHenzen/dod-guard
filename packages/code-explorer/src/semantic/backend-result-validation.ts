import type { SemanticResult } from "./contract.js";

export type BackendResultValidation =
  | { status: "accepted"; result: SemanticResult }
  | {
      status: "rejected";
      code: "invalid_backend_result" | "backend_response_limit";
      adapter_gap?: "unexpected_language";
    }
  | {
      status: "unavailable";
      code: "invalid_backend_result";
      adapter_state: "degraded";
    };
