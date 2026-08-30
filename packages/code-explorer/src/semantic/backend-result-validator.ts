import { Buffer } from "node:buffer";
import {
  type Language,
  type ProjectLocation,
  parseSemanticResult,
  type SemanticResult,
  type SourceRange,
  type SymbolIdentity,
} from "./contract.js";
import type { ProjectRoot } from "./project-root.js";

const MAX_BACKEND_PAYLOAD_BYTES = 1024 * 1024;

export type BackendResultValidation =
  | { status: "accepted"; result: SemanticResult }
  | {
      status: "rejected";
      code: "invalid_backend_result" | "backend_response_limit";
      adapter_gap?: "unexpected_language";
    }
  | { status: "unavailable"; code: "invalid_backend_result"; adapter_state: "degraded" };

export type BackendResultValidationOptions = {
  allowedLanguages: readonly Language[];
  root: ProjectRoot;
  currentGeneration: number;
};

/** Validates an entire backend response before it can enter cached navigation state. */
export function validateBackendResult(
  input: unknown,
  options: BackendResultValidationOptions,
): BackendResultValidation {
  if (payloadSize(input) > MAX_BACKEND_PAYLOAD_BYTES) return { status: "rejected", code: "backend_response_limit" };
  if (containsVirtualDocument(input) || containsStaleRevision(input, options.currentGeneration)) {
    return { status: "unavailable", code: "invalid_backend_result", adapter_state: "degraded" };
  }
  if (containsUnexpectedLanguage(input, options.allowedLanguages)) {
    return { status: "rejected", code: "invalid_backend_result", adapter_gap: "unexpected_language" };
  }

  let result: SemanticResult;
  try {
    result = parseSemanticResult(input);
  } catch {
    return { status: "rejected", code: "invalid_backend_result" };
  }

  try {
    for (const symbol of symbolsIn(result)) validateSymbol(symbol, options);
    for (const location of projectLocationsIn(result)) validateLocation(location, options);
  } catch {
    return { status: "rejected", code: "invalid_backend_result" };
  }
  return { status: "accepted", result };
}

function payloadSize(input: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(input), "utf8");
  } catch {
    return MAX_BACKEND_PAYLOAD_BYTES + 1;
  }
}

function containsVirtualDocument(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  if (Array.isArray(input)) return input.some(containsVirtualDocument);
  const record = input as Record<string, unknown>;
  if (typeof record.uri === "string" && !record.uri.startsWith("file:")) return true;
  return Object.values(record).some(containsVirtualDocument);
}

function containsUnexpectedLanguage(input: unknown, allowedLanguages: readonly Language[]): boolean {
  if (!input || typeof input !== "object") return false;
  if (Array.isArray(input)) return input.some((item) => containsUnexpectedLanguage(item, allowedLanguages));
  const record = input as Record<string, unknown>;
  if (
    "language" in record &&
    typeof record.language === "string" &&
    !allowedLanguages.includes(record.language as Language)
  ) {
    return true;
  }
  return Object.values(record).some((item) => containsUnexpectedLanguage(item, allowedLanguages));
}

function symbolsIn(result: SemanticResult): readonly SymbolIdentity[] {
  if (result.operation === "search") return result.symbols;
  if (result.operation === "focus") return [result.symbol];
  return result.relations.flatMap((relation) => ("symbol" in relation ? [relation.symbol] : []));
}

function projectLocationsIn(result: SemanticResult): readonly ProjectLocation[] {
  if (result.operation === "search") return result.symbols.map(({ location }) => location);
  if (result.operation === "focus") return [result.symbol.location];
  return result.relations.flatMap((relation) => {
    if (!("symbol" in relation)) return [];
    return "external" in relation.location ? [relation.symbol.location] : [relation.symbol.location, relation.location];
  });
}

function validateSymbol(symbol: SymbolIdentity, options: BackendResultValidationOptions): void {
  if (!options.allowedLanguages.includes(symbol.language)) throw new Error("unexpected language");
  validateLocation(symbol.location, options);
}

function validateLocation(location: ProjectLocation, options: BackendResultValidationOptions): void {
  options.root.resolveClientPath(location.path);
  if (!rangeFits(options.root.protectedRead(location.path).bytes, location.range)) throw new Error("invalid range");
}

function rangeFits(source: string, range: SourceRange): boolean {
  const lines = source.split("\n").map((line) => line.replace(/\r$/, ""));
  return (
    positionFits(lines, range.start) && positionFits(lines, range.end) && comparePositions(range.start, range.end) <= 0
  );
}

function containsStaleRevision(input: unknown, currentGeneration: number): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const revision = (input as Record<string, unknown>).revision;
  return (
    !!revision && typeof revision === "object" && (revision as Record<string, unknown>).generation !== currentGeneration
  );
}

function positionFits(lines: readonly string[], position: { line: number; character: number }): boolean {
  return (
    position.line >= 0 &&
    position.line < lines.length &&
    position.character >= 0 &&
    position.character <= lines[position.line].length
  );
}

function comparePositions(
  left: { line: number; character: number },
  right: { line: number; character: number },
): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line;
}
