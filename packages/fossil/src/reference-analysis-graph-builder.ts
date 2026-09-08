import type { ParsedReference, ReferenceGraph } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { strengthForReference } from "./reference-analysis-strength.js";

interface ResolvedReference {
  reference: ParsedReference;
  targetPath: string | undefined;
}

function resolvedTarget(reference: ParsedReference, paths: ReadonlySet<string>): string | undefined {
  if (reference.targetPath !== undefined) return reference.targetPath;
  if (reference.language === "csharp") return undefined;
  return reference.targetCandidates.find((candidate) => paths.has(candidate));
}

function unresolvedReference({
  reference: { sourcePath, targetCandidates: candidates, language, kind, span, resolution },
  targetPath,
}: ResolvedReference) {
  return {
    sourcePath,
    targetCandidates: candidates,
    language,
    kind,
    span,
    resolution: resolution === "external" ? ("external" as const) : ("unresolved" as const),
  };
}

export function referenceGraph(
  parsed: readonly ParsedReference[],
  sources: readonly ReferenceSourceContent[],
): ReferenceGraph {
  const paths = new Set(sources.map((source) => source.path));
  const resolved = parsed.map((reference) => ({
    reference,
    targetPath: resolvedTarget(reference, paths),
  })) satisfies ResolvedReference[];
  const edges = resolved
    .filter((entry) => entry.targetPath !== undefined)
    .map(({ reference, targetPath }) => ({
      sourcePath: reference.sourcePath,
      targetPath: targetPath ?? "",
      language: reference.language,
      kind: reference.kind,
      strength: strengthForReference(reference, sources),
      span: reference.span,
    }));
  const unresolved = resolved
    .filter((entry) => entry.targetPath === undefined)
    .map(unresolvedReference);
  return { edges, unresolved, complete: true, unavailablePaths: [] };
}
