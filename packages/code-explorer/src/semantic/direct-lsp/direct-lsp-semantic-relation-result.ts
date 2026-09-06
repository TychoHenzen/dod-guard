import type { SymbolIdentity } from "../contracts/contract.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";
import * as relationSymbol from "./direct-lsp-semantic-relation-symbol.js";
import type { Relation } from "./direct-lsp-semantic-relation.js";

export function hierarchyRelation(input: {
  relation: "callers" | "callees";
  index: number;
  options: semanticOptions.DirectLspSemanticOptions;
  target: Record<string, unknown> | undefined;
  location: SymbolIdentity["location"] | { external: true };
  callSite: SymbolIdentity["location"] | { external: true };
}): Relation[] {
  if ("external" in input.location)
    return [
      {
        relation: input.relation,
        external: { external: true },
      },
    ];
  return [
    {
      relation: input.relation,
      symbol: relationSymbol.symbolFromRelationLocation({
        target: input.target,
        location: input.location,
        index: input.index,
        options: input.options,
      }),
      location: input.location,
      ...("external" in input.callSite ? {} : { call_site: input.callSite }),
    },
  ];
}
