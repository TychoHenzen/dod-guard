import type { InjectedSemanticBackend } from "../adapters/language-adapter.js";
import type { SemanticRequest, SemanticResult } from "../contracts/contract.js";

async function unavailableQuery(
  _request: SemanticRequest,
): Promise<SemanticResult> {
  throw new Error("backend_unavailable");
}

export const unavailableBackend: InjectedSemanticBackend = {
  readiness: () => ({ state: "unavailable" }),
  query: unavailableQuery,
};
