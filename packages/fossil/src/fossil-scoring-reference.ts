import type { ReferenceGraph } from "./types.js";
import type { CandidateReferenceSubscores } from "./fossil-scoring-types/candidate-reference-subscores.js";

/** Scores how little strong inbound evidence a candidate receives from live source paths. */
export function referenceWeaknessScore(
  candidatePath: string,
  graph: ReferenceGraph,
  candidatePaths: ReadonlySet<string>,
): number {
  const liveInboundSources = new Set(
    graph.edges
      .filter(
        (edge) =>
          edge.targetPath === candidatePath &&
          edge.sourcePath !== candidatePath &&
          edge.strength === "strong" &&
          !candidatePaths.has(edge.sourcePath),
      )
      .map((edge) => edge.sourcePath),
  );
  if (liveInboundSources.size === 0) return 1;
  return liveInboundSources.size === 1 ? 0.5 : 0;
}

/** Scores the fraction of a candidate's unique resolved neighbors that are fossil candidates. */
export function clusterIsolationScore(
  candidatePath: string,
  graph: ReferenceGraph,
  candidatePaths: ReadonlySet<string>,
): number {
  const neighbors = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.sourcePath === candidatePath && edge.targetPath !== candidatePath) neighbors.add(edge.targetPath);
    if (edge.targetPath === candidatePath && edge.sourcePath !== candidatePath) neighbors.add(edge.sourcePath);
  }
  if (neighbors.size === 0) return 1;
  return [...neighbors].filter((neighbor) => candidatePaths.has(neighbor)).length / neighbors.size;
}

/** Derives both reference subscores together, omitting both when candidate evidence is incomplete. */
export function candidateReferenceSubscores(
  candidatePath: string,
  graph: ReferenceGraph,
  candidatePaths: ReadonlySet<string>,
): CandidateReferenceSubscores {
  if (graph.unavailablePaths.includes(candidatePath)) return { available: false };
  return {
    available: true,
    referenceWeakness: referenceWeaknessScore(candidatePath, graph, candidatePaths),
    clusterIsolation: clusterIsolationScore(candidatePath, graph, candidatePaths),
  };
}
