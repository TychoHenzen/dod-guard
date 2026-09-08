import type { ParsedReference } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { compareText, sourceSpan, targetCandidates } from "./reference-analysis-paths.js";

const STATIC_IMPORT = /\bimport\s+(?:[^"'`;\r\n]*?\s+from\s+)?(["'])([^"'\r\n]+)\1/g;
const REQUIRE_CALL = /\brequire\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g;

function isModuleSource(source: ReferenceSourceContent): boolean {
  return source.language === "typescript" || source.language === "javascript";
}

function moduleReference(
  source: ReferenceSourceContent,
  kind: ParsedReference["kind"],
  match: RegExpExecArray,
): ParsedReference | undefined {
  const quote = match[1];
  const specifier = match[2];
  if (!quote) return undefined;
  if (!specifier) return undefined;
  if (match.index === undefined) return undefined;
  const start = match.index + match[0].lastIndexOf(`${quote}${specifier}${quote}`) + 1;
  return {
    sourcePath: source.path,
    targetCandidates: targetCandidates(source.path, specifier),
    span: sourceSpan(source.content, start, start + specifier.length),
    language: source.language,
    kind,
    resolution: specifier.startsWith(".") ? "unresolved" : "external",
    strength: "strong",
  };
}

function compareModuleReferences(left: ParsedReference, right: ParsedReference): number {
  return (
    compareText(left.sourcePath, right.sourcePath) ||
    left.span.start - right.span.start ||
    compareText(left.kind, right.kind)
  );
}

export function parsedModuleReferences(source: ReferenceSourceContent): ParsedReference[] {
  if (!isModuleSource(source)) return [];
  const patterns: readonly [ParsedReference["kind"], RegExp][] = [
    ["import", STATIC_IMPORT],
    ["require", REQUIRE_CALL],
    ["dynamic-import", DYNAMIC_IMPORT],
  ];
  const references: ParsedReference[] = [];
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(source.content); match; match = pattern.exec(source.content)) {
      const reference = moduleReference(source, kind, match);
      if (reference) references.push(reference);
    }
  }
  return references.sort(compareModuleReferences);
}
