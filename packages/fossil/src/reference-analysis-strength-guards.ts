import type { ParsedReference } from "./types.js";
import type {
  ReferenceRange,
  ReferenceSourceContent,
} from "./reference-analysis-types.js";
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

function guardSymbol(
  reference: ParsedReference,
  source: ReferenceSourceContent,
): string {
  const declared = source.content.slice(
    reference.span.start,
    reference.span.end,
  );
  return declared.split(separatorForGuard(reference)).at(-1) ?? "";
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
