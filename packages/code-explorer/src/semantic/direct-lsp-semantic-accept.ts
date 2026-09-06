import { validateBackendResult } from "./backend-result-validator.js";
import type { SemanticResult, SymbolIdentity } from "./contract.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

export function acceptResult(
  result: SemanticResult,
  input: {
    options: semanticOptions.DirectLspSemanticOptions;
    symbols: Map<string, SymbolIdentity>;
  },
): SemanticResult {
  const checked = validateBackendResult(result, {
    allowedLanguages: [input.options.language],
    root: input.options.root,
    currentGeneration: input.options.revision.generation,
  });
  if (checked.status !== "accepted") throw new Error(checked.code);
  retainReturnedSymbols(checked.result, input.symbols);
  return checked.result;
}

function retainReturnedSymbols(
  result: SemanticResult,
  symbols: Map<string, SymbolIdentity>,
): void {
  if (result.operation === "search") return retainSearch(result, symbols);
  if (result.operation === "focus") {
    symbols.set(result.symbol.id, result.symbol);
    return;
  }
  for (const relation of result.relations)
    if ("symbol" in relation) symbols.set(relation.symbol.id, relation.symbol);
}

function retainSearch(
  result: Extract<SemanticResult, { operation: "search" }>,
  symbols: Map<string, SymbolIdentity>,
): void {
  for (const symbol of result.symbols) symbols.set(symbol.id, symbol);
}

export function openSourceDocument(
  source: SymbolIdentity,
  options: semanticOptions.DirectLspSemanticOptions,
): void {
  if (!options.client.openProtectedDocument) return;
  const uri = options.toBackendUri(source.location);
  const document = options.root.protectedRead(source.location.path);
  options.client.openProtectedDocument(uri, {
    language_id: options.language,
    bytes: document.bytes,
  });
}
