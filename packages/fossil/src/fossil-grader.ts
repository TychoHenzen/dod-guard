import type { BurstFileActivity, FossilSubscores, ReferenceGraph, ScoreBasis } from "./types.js";

/** Numeric fossil score with the evidence basis used to compute it. */
export interface FossilScore {
  readonly score: number;
  readonly basis: ScoreBasis;
}

/** Normalizes one candidate's positive burst churn against the positive burst maximum. */
export function normalizedBurstChurn(candidate: BurstFileActivity, burstFiles: readonly BurstFileActivity[]): number {
  const maximumBurstCommits = Math.max(0, ...burstFiles.map((activity) => activity.burstCommits));
  if (maximumBurstCommits === 0) return 0;
  return Math.max(0, candidate.burstCommits) / maximumBurstCommits;
}

/** Scores the absence of post-burst commits for one candidate. */
export function abandonmentScore(candidate: BurstFileActivity): number {
  if (candidate.burstCommits <= 0) return 0;
  return Math.max(0, 1 - candidate.postBurstCommits / candidate.burstCommits);
}

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

/** Combines all four available fossil subscores using the fixed full-evidence weights. */
export function scoreFossilSubscores(subscores: FossilSubscores): FossilScore | undefined {
  if (subscores.referenceWeakness === undefined && subscores.clusterIsolation === undefined) {
    return {
      score: (0.3 / 0.65) * subscores.churn + (0.35 / 0.65) * subscores.abandonment,
      basis: "git-only",
    };
  }
  if (subscores.referenceWeakness === undefined || subscores.clusterIsolation === undefined) return undefined;
  return {
    score:
      0.3 * subscores.churn +
      0.35 * subscores.abandonment +
      0.2 * subscores.referenceWeakness +
      0.15 * subscores.clusterIsolation,
    basis: "full",
  };
}
