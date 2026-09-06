import type { SemanticRequest, SymbolIdentity } from "./contract.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

const LSP_METHODS: Record<string, string> = {
  definition: "textDocument/definition",
  references: "textDocument/references",
  type_definition: "textDocument/typeDefinition",
  implementation: "textDocument/implementation",
  callers: "textDocument/prepareCallHierarchy",
  callees: "textDocument/prepareCallHierarchy",
  search: "workspace/symbol",
};

export function methodFor(operation: SemanticRequest["operation"]): string {
  return LSP_METHODS[operation] ?? "workspace/symbol";
}

export function paramsFor(
  request: SemanticRequest,
  source: SymbolIdentity | undefined,
  options: semanticOptions.DirectLspSemanticOptions,
): Record<string, unknown> {
  if (request.operation === "search") return { query: request.query };
  if (!source) throw new Error("backend_unavailable");
  const textDocument = {
    uri: options.toBackendUri(source.location),
  };
  const position = source.location.range.start;
  return request.operation === "references"
    ? {
        textDocument,
        position,
        context: { includeDeclaration: true },
      }
    : { textDocument, position };
}
