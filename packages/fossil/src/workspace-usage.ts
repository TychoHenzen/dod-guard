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

function edgeTargetsCandidate(edge: { targetPath: string; sourcePath: string }, candidate: string): boolean {
  if (normalizedRepositoryPath(edge.targetPath) !== candidate) return false;
  return normalizedRepositoryPath(edge.sourcePath) !== candidate;
}

function hasGraphUsage(graph: ReturnType<typeof analyzeReferences>, candidate: string): boolean {
  return graph.edges.some((edge) => edgeTargetsCandidate(edge, candidate));
}

function valueUsesCandidate({ value, candidate, candidateBasename, basenameCount }: {
  value: string;
  candidate: string;
  candidateBasename: string;
  basenameCount: number;
}): boolean {
  if (value === candidate) return true;
  return basenameCount === 1 && value === candidateBasename;
}

function sourceUsesCandidate({ source, candidate, candidateBasename, basenameCount }: {
  source: ReferenceSourceContent;
  candidate: string;
  candidateBasename: string;
  basenameCount: number;
}): boolean {
  if (normalizedRepositoryPath(source.path) === candidate) return false;
  return sourceStringValues(source.content).some((value) =>
    valueUsesCandidate({ value, candidate, candidateBasename, basenameCount }),
  );
}

/** Detects resolved imports and exact source-string evidence that an old workspace candidate is in use. */
export function hasInboundWorkspaceUsage(
  candidatePath: string,
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): boolean {
  const normalizedCandidate = normalizedRepositoryPath(candidatePath);
  const graph = analyzeReferences(sources);
  if (hasGraphUsage(graph, normalizedCandidate)) return true;
  const candidateBasename = basename(normalizedCandidate);
  const normalizedInventory = new Set([...inventoryPaths, candidatePath].map(normalizedRepositoryPath));
  const basenameCount = [...normalizedInventory].filter((path) => basename(path) === candidateBasename).length;
  return sources.some((source) => sourceUsesCandidate({
    source,
    candidate: normalizedCandidate,
    candidateBasename,
    basenameCount,
  }));
}

/** Omits workspace candidates when any inbound repository-contained usage evidence is found. */
export function omitUsedWorkspaceCandidates<T extends { readonly path: string }>(
  candidates: readonly T[],
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
): readonly T[] {
  return candidates.filter((candidate) => !hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths));
}
