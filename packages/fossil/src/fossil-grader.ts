import type { BurstFileActivity, FossilFinding, FossilSubscores, ReferenceGraph, ScoreBasis } from "./types.js";

/** Numeric fossil score with the evidence basis used to compute it. */
export interface FossilScore {
  readonly score: number;
  readonly basis: ScoreBasis;
}

/** One scored candidate activity retained with its burst-specific evidence. */
export interface BurstCandidateEvidence {
  readonly burstId: string;
  readonly activity: BurstFileActivity;
  readonly score: FossilScore;
}

/** Required fossil-finding evidence excluding its fixed advisory classification. */
export type AdvisoryFossilFindingInput = Omit<FossilFinding, "classification">;

/** Both reference subscores are available together, or neither is available. */
export type CandidateReferenceSubscores =
  | {
      readonly available: true;
      readonly referenceWeakness: number;
      readonly clusterIsolation: number;
    }
  | {
      readonly available: false;
      readonly referenceWeakness?: never;
      readonly clusterIsolation?: never;
    };

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

/** Returns whether a score meets the inclusive fossil finding threshold. */
export function meetsFossilThreshold(score: number, threshold: number): boolean {
  return score >= threshold;
}

/** Retains every qualifying burst-specific candidate without deduplicating matching paths. */
export function qualifyingBurstCandidates(
  candidates: readonly BurstCandidateEvidence[],
  threshold: number,
): readonly BurstCandidateEvidence[] {
  return candidates.filter((candidate) => meetsFossilThreshold(candidate.score.score, threshold));
}

/** Builds a fossil finding that remains advisory regardless of its score. */
export function createAdvisoryFossilFinding(input: AdvisoryFossilFindingInput): FossilFinding {
  return { ...input, classification: "advisory" };
}
