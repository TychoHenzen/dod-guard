import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import {
  clustersFor,
  similarityMatrix,
} from "./architecture-similarity-clusters.js";
import { largeFinding } from "./architecture-similarity-outlier.js";
import { signatureFor } from "./architecture-similarity-signature.js";

const SIMILARITY_TRIGGER = 25;

function clusterPaths(
  files: ArchitectureFileFact[],
  clusters: number[][],
): string[][] {
  return clusters.map((cluster) =>
    cluster
      .map((index) => files[index].path)
      .sort((left, right) => left.localeCompare(right)),
  );
}

function smallFinding(
  directory: string,
  files: ArchitectureFileFact[],
  clusters: number[][],
) {
  return {
    kind: "similarity-split",
    directory,
    fileCount: files.length,
    trigger: "distinct-clusters",
    clusters: clusterPaths(files, clusters).filter(
      (cluster) => cluster.length > 1,
    ),
    outliers: [],
  };
}

function needsFinding(fileCount: number, clusters: number[][]): boolean {
  const significant = clusters.filter((cluster) => cluster.length > 1);
  return fileCount >= SIMILARITY_TRIGGER
    ? clusters.length > 1
    : significant.length > 1;
}

export function assessSimilarity(
  directory: string,
  files: ArchitectureFileFact[],
) {
  if (files.length < 2) return undefined;
  const scores = similarityMatrix(files.map(signatureFor));
  const clusters = clustersFor(files, scores);
  if (!needsFinding(files.length, clusters)) return undefined;
  return files.length < SIMILARITY_TRIGGER
    ? smallFinding(
        directory,
        files,
        clusters.filter((cluster) => cluster.length > 1),
      )
    : largeFinding({
        directory,
        files,
        scores,
        clusters,
        clusterPaths: clusterPaths(files, clusters),
      });
}
