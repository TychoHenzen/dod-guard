import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { weightedSimilarity } from "./architecture-similarity-signature.js";

const CLUSTER_SIMILARITY = 0.45;

// ponytail: O(n²) keeps this first dependency-free audit simple; index signatures if directories grow further.
export function similarityMatrix(
  signatures: Map<string, number>[],
): number[][] {
  const matrix = signatures.map(() => signatures.map(() => 1));
  for (let left = 0; left < signatures.length; left += 1)
    for (let right = left + 1; right < signatures.length; right += 1) {
      const score = weightedSimilarity(signatures[left], signatures[right]);
      matrix[left][right] = score;
      matrix[right][left] = score;
    }
  return matrix;
}

function root(parent: number[], index: number): number {
  while (parent[index] !== index) {
    parent[index] = parent[parent[index]];
    index = parent[index];
  }
  return index;
}

function join(parent: number[], left: number, right: number): void {
  const leftRoot = root(parent, left);
  const rightRoot = root(parent, right);
  if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function joinSimilar(parent: number[], scores: number[][]): void {
  for (let left = 0; left < scores.length; left += 1)
    for (let right = left + 1; right < scores.length; right += 1)
      if (scores[left][right] >= CLUSTER_SIMILARITY) join(parent, left, right);
}

function grouped(parent: number[], count: number): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (let index = 0; index < count; index += 1) {
    const group = groups.get(root(parent, index)) ?? [];
    group.push(index);
    groups.set(root(parent, index), group);
  }
  return groups;
}

function sortedGroups(
  groups: Map<number, number[]>,
  files: ArchitectureFileFact[],
): number[][] {
  return [...groups.values()].sort(
    (left, right) =>
      right.length - left.length ||
      files[left[0]].path.localeCompare(files[right[0]].path),
  );
}

export function clustersFor(
  files: ArchitectureFileFact[],
  scores: number[][],
): number[][] {
  const parent = files.map((_, index) => index);
  joinSimilar(parent, scores);
  return sortedGroups(grouped(parent, files.length), files);
}
