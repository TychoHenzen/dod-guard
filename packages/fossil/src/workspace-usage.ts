import {
  analyzeReferences,
  type ReferenceSourceContent,
} from "./ref-analyzer.js";
import {
  basename,
  hasGraphUsage,
  normalizedRepositoryPath,
  sourceUsesCandidate,
} from "./workspace-usage-evidence.js";

/** Detects imports and exact source-string usage evidence. */
export function hasInboundWorkspaceUsage(
  candidatePath: string,
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): boolean {
  const normalizedCandidate = normalizedRepositoryPath(candidatePath);
  const graph = analyzeReferences(sources);
  if (hasGraphUsage(graph, normalizedCandidate)) return true;
  const candidateBasename = basename(normalizedCandidate);
  const normalizedInventory = new Set(
    [...inventoryPaths, candidatePath].map(normalizedRepositoryPath),
  );
  const basenameCount = [...normalizedInventory].filter(
    (path) => basename(path) === candidateBasename,
  ).length;
  return sources.some((source) =>
    sourceUsesCandidate({
      source,
      candidate: normalizedCandidate,
      candidateBasename,
      basenameCount,
    }),
  );
}

/** Omits candidates with inbound repository-contained usage evidence. */
export function omitUsedWorkspaceCandidates<
  T extends { readonly path: string },
>(
  candidates: readonly T[],
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): readonly T[] {
  return candidates.filter(
    (candidate) =>
      !hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths),
  );
}
