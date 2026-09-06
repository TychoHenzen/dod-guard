import type { SymbolIdentity } from "../contracts/contract.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

export function lspLocation(
  target: Record<string, unknown> | undefined,
  options: semanticOptions.DirectLspSemanticOptions,
): SymbolIdentity["location"] | { external: true } | undefined {
  const uri = target?.uri ?? target?.targetUri;
  const range = target?.range ?? target?.targetRange;
  if (!(typeof uri === "string" && validRange(range))) return undefined;
  const path = options.fromBackendUri(uri);
  if (path)
    return {
      path,
      range: range as SymbolIdentity["location"]["range"],
    };
  if (uri.startsWith("file:")) return { external: true };
  throw new Error("invalid_backend_result");
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export function validRange(value: unknown): boolean {
  const range = value as {
    start?: { line?: unknown; character?: unknown };
    end?: { line?: unknown; character?: unknown };
  };
  return !!(
    Number.isInteger(range?.start?.line) &&
    Number.isInteger(range.start?.character) &&
    Number.isInteger(range?.end?.line) &&
    Number.isInteger(range.end?.character)
  );
}
