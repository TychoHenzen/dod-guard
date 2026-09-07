import type { SymbolIdentity } from "../contracts/contract.js";
import { asRecord, validRange } from "./direct-lsp-semantic-location.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

export function locations(
  raw: unknown,
  options: semanticOptions.DirectLspSemanticOptions,
): Array<SymbolIdentity["location"] | { external: true }> {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.flatMap((value) => locationFromValue(value, options));
}

function locationFromValue(
  value: unknown,
  options: semanticOptions.DirectLspSemanticOptions,
): Array<SymbolIdentity["location"] | { external: true }> {
  const item = asRecord(value);
  const target = targetFromItem(item);
  if (!target) return [];
  const range = validTargetRange(target);
  if (!range) return [];
  return locationForUri(target.uri ?? target.targetUri, range, options);
}

function validTargetRange(
  target: Record<string, unknown>,
): unknown | undefined {
  const range = target.range ?? target.targetRange;
  return validRange(range) ? range : undefined;
}

function locationForUri(
  uri: unknown,
  range: unknown,
  options: semanticOptions.DirectLspSemanticOptions,
): Array<SymbolIdentity["location"] | { external: true }> {
  const path =
    typeof uri === "string" ? options.fromBackendUri(uri) : undefined;
  if (path)
    return [
      {
        path,
        range: range as SymbolIdentity["location"]["range"],
      },
    ];
  if (typeof uri === "string" && uri.startsWith("file:"))
    return [{ external: true }];
  throw new Error("invalid_backend_result");
}

function targetFromItem(
  item: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const hierarchy = hierarchyTarget(item);
  if (hierarchy) return hierarchy;
  return locationTarget(item);
}

function hierarchyTarget(
  item: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return asRecord(item?.from ?? item?.to);
}

function locationTarget(
  item: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (item?.targetUri) return item;
  const location = asRecord(item?.location);
  return location ?? item;
}
