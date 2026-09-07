import type { SymbolIdentity } from "../contracts/contract.js";
import { asRecord, lspLocation } from "./direct-lsp-semantic-location.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

export function workspaceSymbols(
  raw: unknown,
  options: semanticOptions.DirectLspSemanticOptions,
): SymbolIdentity[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.flatMap((value, index) =>
    workspaceSymbolAt(value, index, options),
  );
}

function workspaceSymbolAt(
  value: unknown,
  index: number,
  options: semanticOptions.DirectLspSemanticOptions,
): SymbolIdentity[] {
  const item = asRecord(value);
  const location = lspLocation(asRecord(item?.location) ?? item, options);
  if (!localLocation(location)) return [];
  return [
    {
      id: `${options.language}:${location.path}:${index}`,
      name: workspaceSymbolName(item, location.path),
      language: options.language,
      kind: workspaceSymbolKind(item?.kind),
      location,
    },
  ];
}

function localLocation(
  value: SymbolIdentity["location"] | { external: true } | undefined,
): value is SymbolIdentity["location"] {
  return value !== undefined && !("external" in value);
}

function workspaceSymbolName(
  item: Record<string, unknown> | undefined,
  fallback: string,
): string {
  return typeof item?.name === "string" ? item.name : fallback;
}

function workspaceSymbolKind(value: unknown): string {
  if (typeof value === "string" && value.length > 0)
    return value.toLocaleLowerCase("en-US");
  const kinds: Record<number, string> = {
    5: "class",
    6: "method",
    12: "function",
  };
  return typeof value === "number" && kinds[value] ? kinds[value] : "symbol";
}
