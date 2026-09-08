import {
  abandonmentScore,
  candidateReferenceSubscores,
  normalizedBurstChurn,
  scoreFossilSubscores,
} from "./fossil-grader.js";
import type { Burst, BurstFileActivity, ReferenceGraph } from "./types.js";

export function scoreSubscores(input: {
  candidate: BurstFileActivity;
  burst: Burst;
  graph: ReferenceGraph;
  candidatePaths: ReadonlySet<string>;
}) {
  const reference = candidateReferenceSubscores(
    input.candidate.path,
    input.graph,
    input.candidatePaths,
  );
  const base = {
    churn: normalizedBurstChurn(input.candidate, input.burst.files),
    abandonment: abandonmentScore(input.candidate),
  };
  const subscores = reference.available
    ? {
        ...base,
        referenceWeakness: reference.referenceWeakness,
        clusterIsolation: reference.clusterIsolation,
      }
    : base;
  return { reference, subscores, score: scoreFossilSubscores(subscores) };
}

function isStrongInbound(
  edge: ReferenceGraph["edges"][number],
  path: string,
  candidatePaths: ReadonlySet<string>,
): boolean {
  if (edge.targetPath !== path) return false;
  if (edge.strength !== "strong") return false;
  return !candidatePaths.has(edge.sourcePath);
}

export function strongInboundCount(
  graph: ReferenceGraph,
  path: string,
  candidatePaths: ReadonlySet<string>,
): number {
  return new Set(
    graph.edges
      .filter((edge) => isStrongInbound(edge, path, candidatePaths))
      .map((edge) => edge.sourcePath),
  ).size;
}

export function neighborPaths(
  graph: ReferenceGraph,
  path: string,
): ReadonlySet<string> {
  const neighbors = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.sourcePath === path) neighbors.add(edge.targetPath);
    if (edge.targetPath === path) neighbors.add(edge.sourcePath);
  }
  return neighbors;
}

export function selectedNeighbors(
  neighbors: ReadonlySet<string>,
  candidatePaths: ReadonlySet<string>,
  selected: boolean,
): string[] {
  return [...neighbors]
    .filter((path) => candidatePaths.has(path) === selected)
    .sort();
}

export function referenceAvailability(
  available: boolean,
): "complete" | "unavailable" {
  if (available) return "complete";
  return "unavailable";
}
