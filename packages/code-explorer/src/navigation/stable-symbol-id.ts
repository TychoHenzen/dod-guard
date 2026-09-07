import { createHash } from "node:crypto";
import type { SymbolIdentity } from "../semantic/api/public-api.js";

export function stableSymbolId(symbol: SymbolIdentity): string {
  const range = symbol.location.range;
  const qualifiedName = symbol.qualified_name ?? symbol.name;
  const identity = [
    symbol.language,
    symbol.location.path.replaceAll("\\", "/"),
    `${range.start.line}:${range.start.character}-` +
      `${range.end.line}:${range.end.character}`,
    symbol.kind,
    qualifiedName,
  ].join("\u0000");
  return createHash("sha256").update(identity, "utf8").digest("base64url");
}
