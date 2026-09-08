import type {
  Language,
  ProjectRevision,
  SemanticRequest,
  SemanticResult,
  SymbolIdentity,
} from "../semantic/contracts/contract.js";

type AdapterResultFactory = (request: SemanticRequest) => SemanticResult;

export function createAdapterResult(
  language: Language,
  path: string,
  kind: string,
): AdapterResultFactory {
  const location = {
    path,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 6 },
    },
  };
  return (request) => adapterResult(request, { language, kind, location });
}

function adapterResult(
  request: SemanticRequest,
  context: Omit<Parameters<typeof focusResult>[0], "revision">,
): SemanticResult {
  const revision = { generation: 1, manifest_sha256: "manifest-sha256" };
  if (request.operation === "search")
    return { operation: "search", revision, symbols: [] };
  if (request.operation === "focus")
    return focusResult({ ...context, revision });
  return { operation: request.operation, revision, relations: [] };
}

function focusResult(
  context: Pick<SymbolIdentity, "language" | "kind" | "location"> & {
    revision: ProjectRevision;
  },
): SemanticResult {
  return {
    operation: "focus",
    revision: context.revision,
    symbol: {
      id: `${context.language}:helper`,
      name: "helper",
      language: context.language,
      kind: context.kind,
      location: context.location,
    },
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
