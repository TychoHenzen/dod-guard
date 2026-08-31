import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import type { FocusContent, SymbolIdentity } from "../semantic/contract.js";

export const DEFAULT_BODY_LIMIT_BYTES = 32 * 1024;
export const MIN_BODY_LIMIT_BYTES = 1024;
export const MAX_BODY_LIMIT_BYTES = 128 * 1024;

export type FocusHandle = { handle: string; name: string; symbol_id: string };
export type FocusView = {
  view_id: string;
  symbol_id: string;
  name: string;
  qualified_name: string;
  language: string;
  kind: string;
  path: string;
  range: SymbolIdentity["location"]["range"];
  content: {
    body?: string;
    declaration?: string;
    truncated: boolean;
    limit_bytes: number;
    returned_bytes: number;
    total_bytes: number;
  };
  handles: readonly FocusHandle[];
};

export class FocusBodyLimitError extends Error {
  constructor(readonly limit: number) {
    super("resource_limit");
  }
}

/** Creates an immutable response from semantic content without reading a source file itself. */
export function createFocusView(
  symbol: SymbolIdentity,
  detail: FocusContent | undefined,
  requestedLimit?: number,
): FocusView {
  const limit = requestedLimit ?? DEFAULT_BODY_LIMIT_BYTES;
  if (!Number.isInteger(limit) || limit < MIN_BODY_LIMIT_BYTES || limit > MAX_BODY_LIMIT_BYTES)
    throw new FocusBodyLimitError(limit);

  const source = detail?.body ?? detail?.declaration;
  const bounded = boundUtf8(source ?? "", limit);
  const content = {
    ...(detail?.body !== undefined
      ? { body: bounded.value }
      : detail?.declaration !== undefined
        ? { declaration: bounded.value }
        : {}),
    truncated: bounded.truncated,
    limit_bytes: limit,
    returned_bytes: bounded.returnedBytes,
    total_bytes: bounded.totalBytes,
  };
  const symbolId = stableSymbolId(symbol);
  const handles = (detail?.visible_symbols ?? [])
    .filter(({ name }) => source?.includes(name) ?? false)
    .map(({ name, symbol_id }) => ({ handle: randomUUID(), name, symbol_id }));
  return {
    view_id: randomUUID(),
    symbol_id: symbolId,
    name: symbol.name,
    qualified_name: symbol.qualified_name ?? symbol.name,
    language: symbol.language,
    kind: symbol.kind,
    path: symbol.location.path.replaceAll("\\", "/"),
    range: symbol.location.range,
    content,
    handles,
  };
}

export function stableSymbolId(symbol: SymbolIdentity): string {
  const range = symbol.location.range;
  const qualifiedName = symbol.qualified_name ?? symbol.name;
  const identity = [
    symbol.language,
    symbol.location.path.replaceAll("\\", "/"),
    `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`,
    symbol.kind,
    qualifiedName,
  ].join("\u0000");
  return createHash("sha256").update(identity, "utf8").digest("base64url");
}

function boundUtf8(
  value: string,
  limit: number,
): {
  value: string;
  truncated: boolean;
  returnedBytes: number;
  totalBytes: number;
} {
  const totalBytes = Buffer.byteLength(value, "utf8");
  if (totalBytes <= limit) return { value, truncated: false, returnedBytes: totalBytes, totalBytes };
  let prefix = "";
  let returnedBytes = 0;
  for (const codePoint of value) {
    const bytes = Buffer.byteLength(codePoint, "utf8");
    if (returnedBytes + bytes > limit) break;
    prefix += codePoint;
    returnedBytes += bytes;
  }
  return { value: prefix, truncated: true, returnedBytes, totalBytes };
}
