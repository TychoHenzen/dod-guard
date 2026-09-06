import type {
  RelationName,
  SemanticResult,
  SymbolIdentity,
} from "./contract.js";
import { locations } from "./direct-lsp-semantic-locations.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

export function locationResult(input: {
  request: { operation: RelationName };
  raw: unknown;
  options: semanticOptions.DirectLspSemanticOptions;
}): SemanticResult {
  return {
    operation: input.request.operation,
    revision: input.options.revision,
    relations: locations(input.raw, input.options).map((location, index) =>
      relationFromLocation({
        operation: input.request.operation,
        location,
        index,
        options: input.options,
      }),
    ),
  };
}

function relationFromLocation(input: {
  operation: RelationName;
  location: SymbolIdentity["location"] | { external: true };
  index: number;
  options: semanticOptions.DirectLspSemanticOptions;
}) {
  if ("external" in input.location)
    return {
      relation: input.operation,
      external: { external: true as const },
    };
  return {
    relation: input.operation,
    symbol: symbolFor(input.location, input.index, input.options),
    location: input.location,
  };
}

function symbolFor(
  location: SymbolIdentity["location"],
  index: number,
  options: semanticOptions.DirectLspSemanticOptions,
): SymbolIdentity {
  return {
    id: `${options.language}:${location.path}:${index}`,
    name: location.path,
    language: options.language,
    kind: "symbol",
    location,
  };
}
