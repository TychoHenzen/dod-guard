import type { SymbolIdentity } from "./contract.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

export function symbolFromRelationLocation(input: {
  target: Record<string, unknown> | undefined;
  location: SymbolIdentity["location"];
  index: number;
  options: semanticOptions.DirectLspSemanticOptions;
}): SymbolIdentity {
  return {
    id: `${input.options.language}:${input.location.path}:${input.index}`,
    name:
      typeof input.target?.name === "string"
        ? input.target.name
        : input.location.path,
    language: input.options.language,
    kind: String(input.target?.kind ?? "symbol"),
    location: input.location,
  };
}
