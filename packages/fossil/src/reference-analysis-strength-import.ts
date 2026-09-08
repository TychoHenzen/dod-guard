import type { ParsedReference } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types.js";
import { localImportBindings } from "./reference-analysis-declarations.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
import {
  fallbackRegions,
  isInsideFallback,
} from "./reference-analysis-strength-import-fallback.js";
import { importUses } from "./reference-analysis-strength-import-uses.js";

function importDeclarationEnd(content: string, spanEnd: number): number {
  const semicolon = content.indexOf(";", spanEnd);
  const newline = content.indexOf("\n", spanEnd);
  if (semicolon === -1) return newline;
  if (newline === -1) return semicolon;
  return Math.min(semicolon, newline);
}

function importDeclaration(
  reference: ParsedReference,
  source: ReferenceSourceContent,
): {
  text: string;
  declarationStart: number;
  declarationEnd: number;
} {
  const declarationStart = source.content.lastIndexOf(
    "import",
    reference.span.start,
  );
  const declarationEnd = importDeclarationEnd(
    source.content,
    reference.span.end,
  );
  return {
    text: source.content.slice(declarationStart, declarationEnd + 1),
    declarationStart,
    declarationEnd,
  };
}

export function importReferenceStrength(
  reference: ParsedReference,
  source: ReferenceSourceContent,
): "strong" | "weak" {
  const {
    text: declaration,
    declarationStart,
    declarationEnd,
  } = importDeclaration(reference, source);
  const bindings = localImportBindings(declaration);
  if (bindings.length === 0) return "strong";
  const view = syntaxView(source.content);
  const uses = importUses({
    bindings,
    source,
    declarationStart,
    declarationEnd,
    view,
  });
  const regions = fallbackRegions(source, view);
  if (uses.length === 0) return "strong";
  if (!uses.every((index) => isInsideFallback(index, regions))) return "strong";
  return "weak";
}
