import type { RelationName, SymbolIdentity } from "../contracts/contract.js";
import { asRecord, lspLocation } from "./direct-lsp-semantic-location.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";
import type { Relation } from "./direct-lsp-semantic-relation.js";
import { hierarchyRelation } from "./direct-lsp-semantic-relation-result.js";

export function hierarchyRelations(input: {
  raw: unknown;
  relation: "callers" | "callees";
  source: SymbolIdentity | undefined;
  options: semanticOptions.DirectLspSemanticOptions;
}): Relation[] {
  const values = Array.isArray(input.raw) ? input.raw : [];
  return values.flatMap((value, index) =>
    hierarchyRelationAt({ ...input, value, index }),
  );
}

function hierarchyRelationAt(input: {
  value: unknown;
  index: number;
  relation: "callers" | "callees";
  source: SymbolIdentity | undefined;
  options: semanticOptions.DirectLspSemanticOptions;
}): Relation[] {
  const entry = asRecord(input.value);
  const target = asRecord(
    entry?.[input.relation === "callers" ? "from" : "to"],
  );
  const location = lspLocation(target, input.options);
  if (!location) return [];
  const callSite = hierarchyCallSite({
    relation: input.relation,
    source: input.source,
    options: input.options,
    target,
    entry,
    fallback: location,
  });
  if (!callSite) return [];
  return hierarchyRelation({
    ...input,
    target,
    location,
    callSite,
  });
}

function hierarchyCallSite(input: {
  relation: "callers" | "callees";
  source: SymbolIdentity | undefined;
  options: semanticOptions.DirectLspSemanticOptions;
  target: Record<string, unknown> | undefined;
  entry: Record<string, unknown> | undefined;
  fallback: SymbolIdentity["location"] | { external: true } | undefined;
}): SymbolIdentity["location"] | { external: true } | undefined {
  if (!Array.isArray(input.entry?.fromRanges)) return input.fallback;
  const uri =
    input.relation === "callees" && input.source
      ? input.options.toBackendUri(input.source.location)
      : input.target?.uri;
  return lspLocation({ uri, range: input.entry.fromRanges[0] }, input.options);
}
