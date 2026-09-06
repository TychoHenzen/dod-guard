import type { SemanticRequest, SemanticResult } from "./contract.js";
import type { InjectedSemanticBackend } from "./language-adapter.js";

async function unavailableQuery(
  _request: SemanticRequest,
): Promise<SemanticResult> {
  throw new Error("backend_unavailable");
}

export const unavailableBackend: InjectedSemanticBackend = {
  readiness: () => ({ state: "unavailable" }),
  query: unavailableQuery,
};
