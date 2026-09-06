import type {
  RelationResult,
  SemanticResult,
  SymbolIdentity,
} from "../contracts/contract.js";
import type * as validation from "./backend-result-validation-options.js";

export function symbolsIn(result: SemanticResult): readonly SymbolIdentity[] {
  if (result.operation === "search") return result.symbols;
  if (result.operation === "focus") return [result.symbol];
  return result.relations.flatMap((relation) =>
    "symbol" in relation ? [relation.symbol] : [],
  );
}

export function projectLocationsIn(
  result: SemanticResult,
): readonly SymbolIdentity["location"][] {
  if (result.operation === "search")
    return result.symbols.map(({ location }) => location);
  if (result.operation === "focus") return [result.symbol.location];
  return result.relations.flatMap((relation) => relationLocations(relation));
}

function relationLocations(
  relation: RelationResult["relations"][number],
): readonly SymbolIdentity["location"][] {
  if (!("symbol" in relation)) return [];
  return "external" in relation.location
    ? [relation.symbol.location]
    : [relation.symbol.location, relation.location];
}

export function validateSymbol(
  symbol: SymbolIdentity,
  options: validation.BackendResultValidationOptions,
): void {
  if (!options.allowedLanguages.includes(symbol.language))
    throw new Error("unexpected language");
  validateLocation(symbol.location, options);
}

export function validateLocation(
  location: SymbolIdentity["location"],
  options: validation.BackendResultValidationOptions,
): void {
  options.root.resolveClientPath(location.path);
  const source = options.root.protectedRead(location.path).bytes;
  if (!rangeFits(source, location.range)) throw new Error("invalid range");
}

function rangeFits(
  source: string,
  range: SymbolIdentity["location"]["range"],
): boolean {
  const lines = source.split("\n").map((line) => line.replace(/\r$/, ""));
  return (
    positionFits(lines, range.start) &&
    positionFits(lines, range.end) &&
    comparePositions(range.start, range.end) <= 0
  );
}

function positionFits(
  lines: readonly string[],
  position: { line: number; character: number },
): boolean {
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
  return left.line === right.line
    ? left.character - right.character
    : left.line - right.line;
}
