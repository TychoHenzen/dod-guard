import type {
  RelationName,
  SemanticRequest,
  SemanticResult,
  SymbolIdentity,
} from "../contracts/contract.js";
import * as semanticCapabilities from "./direct-lsp-semantic-capabilities.js";
import { locationResult } from "./direct-lsp-semantic-location-results.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";
import { hierarchyRelations } from "./direct-lsp-semantic-relations.js";
import { workspaceSymbols } from "./direct-lsp-semantic-workspace.js";

type RelationRequest = {
  operation: RelationName;
  symbol_id: string;
};

export function normalizeResult(input: {
  request: SemanticRequest;
  raw: unknown;
  source: SymbolIdentity | undefined;
  options: semanticOptions.DirectLspSemanticOptions;
}): SemanticResult {
  if (input.request.operation === "search")
    return {
      operation: "search",
      revision: input.options.revision,
      symbols: workspaceSymbols(input.raw, input.options),
    };
  if (input.request.operation === "focus")
    return focusResult(input.source, input.options);
  return relationResult({
    request: input.request as RelationRequest,
    raw: input.raw,
    source: input.source,
    options: input.options,
  });
}

function focusResult(
  source: SymbolIdentity | undefined,
  options: semanticOptions.DirectLspSemanticOptions,
): Extract<SemanticResult, { operation: "focus" }> {
  if (!source) throw new Error("backend_unavailable");
  const document = options.root.protectedRead(source.location.path);
  return {
    operation: "focus",
    revision: options.revision,
    symbol: source,
    content: {
      body: document.bytes,
      visible_symbols: [{ name: source.name, symbol_id: source.id }],
    },
  };
}

function relationResult(input: {
  request: RelationRequest;
  raw: unknown;
  source: SymbolIdentity | undefined;
  options: semanticOptions.DirectLspSemanticOptions;
}): SemanticResult {
  const capability = semanticCapabilities.relationCapabilitiesFromInitialize(
    input.options.client.status(),
  )[input.request.operation];
  if (capability.state !== "ready") throw new Error("backend_unavailable");
  const request = input.request;
  if (isHierarchyRelation(request))
    return hierarchyResult({ ...input, request });
  return locationResult(input);
}

function isHierarchyRelation(
  request: RelationRequest,
): request is RelationRequest & {
  operation: "callers" | "callees";
} {
  return request.operation === "callers" || request.operation === "callees";
}

function hierarchyResult(input: {
  request: RelationRequest & {
    operation: "callers" | "callees";
  };
  raw: unknown;
  source: SymbolIdentity | undefined;
  options: semanticOptions.DirectLspSemanticOptions;
}): SemanticResult {
  return {
    operation: input.request.operation,
    revision: input.options.revision,
    relations: hierarchyRelations({
      raw: input.raw,
      relation: input.request.operation,
      source: input.source,
      options: input.options,
    }),
  };
}
