import type { ParsedReference } from "./types.js";
import type {
  ReferenceSourceContent,
} from "./reference-analysis-types/reference-source-content.js";
import type {
  ReferenceRange,
} from "./reference-analysis-types/reference-range.js";
import { declarationRange } from "./reference-analysis-declarations.js";
import {
  csharpGuardRanges,
  rustGuardRanges,
} from "./reference-analysis-guards.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";

function separatorForGuard(reference: ParsedReference): string {
  if (reference.kind === "csharp-using") return ".";
  return "::";
}

function targetPath(reference: ParsedReference): string {
  if (reference.targetPath !== undefined) return reference.targetPath;
  const candidate = reference.targetCandidates[0];
  if (candidate !== undefined) return candidate;
  return "";
}

function targetSymbol(reference: ParsedReference): string {
  const symbol = targetPath(reference).split(/[/.]/).at(-2);
  if (symbol === undefined) return "";
  return symbol;
}

function guardSymbol(
  reference: ParsedReference,
  source: ReferenceSourceContent,
): string {
  const declared = source.content.slice(
    reference.span.start,
    reference.span.end,
  );
  const symbol = declared.split(separatorForGuard(reference)).at(-1);
  if (symbol !== undefined) return symbol;
  return targetSymbol(reference);
}

function guardUses(
  reference: ParsedReference,
  source: ReferenceSourceContent,
  view: ReturnType<typeof syntaxView>,
): number[] {
  const symbol = guardSymbol(reference, source);
  const declaration = declarationRange(source.content, reference.span.start);
  return [...source.content.matchAll(new RegExp(`\\b${symbol}\\b`, "g"))]
    .map((match) => match.index ?? -1)
    .filter(
      (index) =>
        (index < declaration.start || index >= declaration.end) &&
        view.code[index] === source.content[index],
    );
}

function guardRanges(
  reference: ParsedReference,
  view: ReturnType<typeof syntaxView>,
) {
  if (reference.kind === "csharp-using") return csharpGuardRanges(view);
  return rustGuardRanges(view);
}

function allUsesAreGuarded(
  uses: readonly number[],
  ranges: readonly ReferenceRange[],
): boolean {
  if (uses.length === 0) return false;
  return uses.every((index) =>
    ranges.some((range) => index > range.start && index < range.end),
  );
}

export function guardedReferenceStrength(
  reference: ParsedReference,
  source: ReferenceSourceContent,
): "strong" | "weak" {
  const view = syntaxView(source.content);
  const uses = guardUses(reference, source, view);
  const ranges = guardRanges(reference, view);
  if (allUsesAreGuarded(uses, ranges)) return "weak";
  return "strong";
}
