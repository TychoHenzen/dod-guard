import { posix } from "node:path";
import { analyzeReferences, type ReferenceSourceContent } from "./ref-analyzer.js";

function normalizedRepositoryPath(path: string): string {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function basename(path: string): string {
  return normalizedRepositoryPath(path).split("/").at(-1) ?? "";
}

function sourceStringValues(content: string): readonly string[] {
  const values: string[] = [];
  const matcher = /(["'`])([^"'`\r\n]+)\1/g;
  for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
    const value = match[2];
    if (value !== undefined) values.push(normalizedRepositoryPath(value));
  }
  return values;
}

/** Detects resolved imports and exact source-string evidence that an old workspace candidate is in use. */
export function hasInboundWorkspaceUsage(
  candidatePath: string,
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): boolean {
  const normalizedCandidate = normalizedRepositoryPath(candidatePath);
  const graph = analyzeReferences(sources);
  if (
    graph.edges.some(
      (edge) =>
        normalizedRepositoryPath(edge.targetPath) === normalizedCandidate &&
        normalizedRepositoryPath(edge.sourcePath) !== normalizedCandidate,
    )
  )
    return true;
  const candidateBasename = basename(normalizedCandidate);
  const normalizedInventory = new Set([...inventoryPaths, candidatePath].map(normalizedRepositoryPath));
  const basenameCount = [...normalizedInventory].filter((path) => basename(path) === candidateBasename).length;
  return sources.some((source) => {
    if (normalizedRepositoryPath(source.path) === normalizedCandidate) return false;
    return sourceStringValues(source.content).some(
      (value) => value === normalizedCandidate || (basenameCount === 1 && value === candidateBasename),
    );
  });
}

/** Omits workspace candidates when any inbound repository-contained usage evidence is found. */
export function omitUsedWorkspaceCandidates<T extends { readonly path: string }>(
  candidates: readonly T[],
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): readonly T[] {
  return candidates.filter((candidate) => !hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths));
}
