import type {
  RelationName,
  SemanticRequest,
  SymbolIdentity,
} from "./contract.js";
import {
  executeSemanticQuery,
  type SemanticQueryInput,
} from "./direct-lsp-semantic-execute.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";
import type { SemanticQuery } from "./direct-lsp-semantic-query-type.js";

export function createSemanticQuery(input: {
  options: semanticOptions.DirectLspSemanticOptions;
  unavailableRelations: Set<RelationName>;
  symbols: Map<string, SymbolIdentity>;
}): SemanticQuery {
  const queryInput: SemanticQueryInput = input;
  return (request) => executeSemanticQuery(request, queryInput);
}
