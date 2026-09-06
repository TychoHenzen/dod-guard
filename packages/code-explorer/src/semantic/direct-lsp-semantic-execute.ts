import type * as contract from "./contract.js";
import {
  acceptResult,
  openSourceDocument,
} from "./direct-lsp-semantic-accept.js";
import { assertAvailable } from "./direct-lsp-semantic-availability.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";
import { requestLsp } from "./direct-lsp-semantic-request.js";
import { normalizeResult } from "./direct-lsp-semantic-results.js";

export type SemanticQueryInput = {
  options: semanticOptions.DirectLspSemanticOptions;
  unavailableRelations: Set<contract.RelationName>;
  symbols: Map<string, contract.SymbolIdentity>;
};

export async function executeSemanticQuery(
  request: contract.SemanticRequest,
  input: SemanticQueryInput,
): Promise<contract.SemanticResult> {
  assertAvailable(request, input);
  const source = sourceFor(request, input.symbols);
  openSourceIfNeeded(request, source, input.options);
  try {
    const result = await normalizeRequest(request, source, input.options);
    return acceptResult(result, input);
  } catch (error) {
    markUnavailable(request, input.unavailableRelations);
    throw error;
  }
}

async function normalizeRequest(
  request: contract.SemanticRequest,
  source: contract.SymbolIdentity | undefined,
  options: semanticOptions.DirectLspSemanticOptions,
): Promise<contract.SemanticResult> {
  const raw = await requestLsp(request, source, options);
  return normalizeResult({ request, raw, source, options });
}

function openSourceIfNeeded(
  request: contract.SemanticRequest,
  source: contract.SymbolIdentity | undefined,
  options: semanticOptions.DirectLspSemanticOptions,
): void {
  if (source && request.operation !== "focus")
    openSourceDocument(source, options);
}

function sourceFor(
  request: contract.SemanticRequest,
  symbols: Map<string, contract.SymbolIdentity>,
): contract.SymbolIdentity | undefined {
  return request.operation === "search"
    ? undefined
    : symbols.get(request.symbol_id);
}

function markUnavailable(
  request: contract.SemanticRequest,
  unavailableRelations: Set<contract.RelationName>,
): void {
  if (isRelation(request)) unavailableRelations.add(request.operation);
}

function isRelation(
  request: contract.SemanticRequest,
): request is contract.SemanticRequest & {
  operation: contract.RelationName;
} {
  return request.operation !== "search" && request.operation !== "focus";
}
