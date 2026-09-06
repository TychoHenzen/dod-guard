import { asRecord, validRange } from "./direct-lsp-semantic-location.js";

export function documentSymbols(
  raw: unknown,
  uri: string,
): Record<string, unknown>[] {
  const values = Array.isArray(raw) ? raw : [];
  return values.flatMap((value) => documentSymbolAt(value, uri));
}

function documentSymbolAt(
  value: unknown,
  uri: string,
): Record<string, unknown>[] {
  const symbol = asRecord(value);
  if (!symbol) return [];
  const range = validRange(symbol.selectionRange)
    ? symbol.selectionRange
    : symbol.range;
  const current = validRange(range)
    ? [
        {
          name: symbol.name,
          kind: symbol.kind,
          location: { uri, range },
        },
      ]
    : [];
  return [...current, ...documentSymbols(symbol.children, uri)];
}
