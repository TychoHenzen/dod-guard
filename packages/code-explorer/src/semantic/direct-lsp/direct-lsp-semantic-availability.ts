import type {
  RelationName,
  SemanticRequest,
  SymbolIdentity,
} from "../contracts/contract.js";
import * as semanticCapabilities from "./direct-lsp-semantic-capabilities.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

export function assertAvailable(
  request: SemanticRequest,
  input: {
    options: semanticOptions.DirectLspSemanticOptions;
    unavailableRelations: Set<RelationName>;
    symbols: Map<string, SymbolIdentity>;
  },
): void {
  if (unavailableRelation(request, input.unavailableRelations))
    throw new Error("backend_unavailable");
  assertSymbolAvailable(request, input.symbols);
  assertRelationAvailable(request, input.options);
}

function assertSymbolAvailable(
  request: SemanticRequest,
  symbols: Map<string, SymbolIdentity>,
): void {
  if (request.operation !== "search" && !symbols.has(request.symbol_id))
    throw new Error("backend_unavailable");
}

function assertRelationAvailable(
  request: SemanticRequest,
  options: semanticOptions.DirectLspSemanticOptions,
): void {
  if (
    isRelation(request) &&
    semanticCapabilities.relationCapabilitiesFromInitialize(
      options.client.status(),
    )[request.operation].state !== "ready"
  )
    throw new Error("backend_unavailable");
}

function unavailableRelation(
  request: SemanticRequest,
  unavailableRelations: Set<RelationName>,
): boolean {
  return isRelation(request) && unavailableRelations.has(request.operation);
}

function isRelation(request: SemanticRequest): request is SemanticRequest & {
  operation: RelationName;
} {
  return request.operation !== "search" && request.operation !== "focus";
}
