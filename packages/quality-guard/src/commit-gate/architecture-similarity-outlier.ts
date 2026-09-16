import type { ArchitectureFileFact } from "./architecture-file-fact.js";

function better(
  left: { path: string; similarity: number },
  right: { path: string; similarity: number },
): boolean {
  return (
    left.similarity > right.similarity ||
    (left.similarity === right.similarity && left.path < right.path)
  );
}

function outlierEvidence(input: {
  files: ArchitectureFileFact[];
  scores: number[][];
  index: number;
  dominant: number[];
}) {
  let nearest = { path: "", similarity: -1 };
  for (const candidate of input.dominant) {
    const next = {
      path: input.files[candidate].path,
      similarity: input.scores[input.index][candidate],
    };
    if (better(next, nearest)) nearest = next;
  }
  return {
    path: input.files[input.index].path,
    nearest: nearest.path,
    similarity: Math.round(nearest.similarity * 1_000) / 1_000,
  };
}

export function largeFinding(input: {
  directory: string;
  files: ArchitectureFileFact[];
  scores: number[][];
  clusters: number[][];
  clusterPaths: string[][];
}) {
  const dominant = input.clusters[0];
  const dominantSet = new Set(dominant);
  return {
    kind: "similarity-outlier",
    directory: input.directory,
    fileCount: input.files.length,
    trigger: "file-count",
    clusters: input.clusterPaths,
    outliers: input.files
      .map((_, index) => index)
      .filter((index) => !dominantSet.has(index))
      .map((index) => outlierEvidence({ ...input, index, dominant }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
}
