import { posix } from "node:path";
import {
  analyzeReferences,
  type ReferenceSourceContent,
} from "./repository-analysis-reference-boundary.js";

export function normalizedRepositoryPath(path: string): string {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}

export function basename(path: string): string {
  return normalizedRepositoryPath(path).split("/").at(-1) ?? "";
}

function sourceStringValues(content: string): readonly string[] {
  const values: string[] = [];
  const matcher = /(["'`])([^"'`\r\n]+)\1/g;
  for (
    let match = matcher.exec(content);
    match;
    match = matcher.exec(content)
  ) {
    const value = match[2];
    if (value !== undefined) values.push(normalizedRepositoryPath(value));
  }
  return values;
}

function edgeTargetsCandidate(
  edge: { targetPath: string; sourcePath: string },
  candidate: string,
): boolean {
  if (normalizedRepositoryPath(edge.targetPath) !== candidate) return false;
  return normalizedRepositoryPath(edge.sourcePath) !== candidate;
}

export function hasGraphUsage(
  graph: ReturnType<typeof analyzeReferences>,
  candidate: string,
): boolean {
  return graph.edges.some((edge) => edgeTargetsCandidate(edge, candidate));
}

function valueUsesCandidate(input: {
  value: string;
  candidate: string;
  candidateBasename: string;
  basenameCount: number;
}): boolean {
  if (input.value === input.candidate) return true;
  return input.basenameCount === 1 && input.value === input.candidateBasename;
}

export function sourceUsesCandidate(input: {
  source: ReferenceSourceContent;
  candidate: string;
  candidateBasename: string;
  basenameCount: number;
}): boolean {
  if (normalizedRepositoryPath(input.source.path) === input.candidate)
    return false;
  return sourceStringValues(input.source.content).some((value) =>
    valueUsesCandidate({ ...input, value }),
  );
}
