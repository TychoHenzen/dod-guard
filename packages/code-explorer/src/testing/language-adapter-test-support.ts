import type {
  Language,
  SemanticRequest,
  SemanticResult,
} from "../semantic/contracts/contract.js";

export function createAdapterResult(
  language: Language,
  path: string,
  kind: string,
): (request: SemanticRequest) => SemanticResult {
  const location = {
    path,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 6 },
    },
  };
  return (request) => {
    const revision = {
      generation: 1,
      manifest_sha256: "manifest-sha256",
    };
    if (request.operation === "search")
      return { operation: "search", revision, symbols: [] };
    if (request.operation === "focus")
      return {
        operation: "focus",
        revision,
        symbol: {
          id: `${language}:helper`,
          name: "helper",
          language,
          kind,
          location,
        },
      };
    return {
      operation: request.operation,
      revision,
      relations: [],
    };
  };
}

export function adapterRequests(symbolId: string): SemanticRequest[] {
  return [
    { operation: "search", query: "helper" },
    { operation: "focus", symbol_id: symbolId },
    { operation: "definition", symbol_id: symbolId },
    { operation: "references", symbol_id: symbolId },
    { operation: "type_definition", symbol_id: symbolId },
    { operation: "implementation", symbol_id: symbolId },
    { operation: "callers", symbol_id: symbolId },
    { operation: "callees", symbol_id: symbolId },
  ];
}

export function invalidSemanticResultBackend() {
  return {
    readiness: () => ({ state: "ready" as const }),
    query: async () =>
      ({
        operation: "search",
        revision: {
          generation: 1,
          manifest_sha256: "manifest-sha256",
        },
        symbols: [{}],
      }) as unknown as SemanticResult,
  };
}
