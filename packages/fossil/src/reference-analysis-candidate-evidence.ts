import type { ReferenceGraph } from "./types.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import { compareText } from "./reference-analysis-paths.js";
import { emptyReferenceGraph } from "./reference-read-support.js";

/** Regrades current edges between two fossil candidates before scoring. */
export function regradeVestigialEdges(graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): ReferenceGraph {
  return {
    ...graph,
    edges: graph.edges.map((edge) =>
      candidatePaths.has(edge.sourcePath) && candidatePaths.has(edge.targetPath)
        ? { ...edge, strength: "vestigial" }
        : { ...edge },
    ),
  };
}

/** Marks candidate reference evidence unavailable when unresolved paths could target it. */
export function markUnresolvedCandidateEvidence(
  graph: ReferenceGraph,
  candidatePaths: ReadonlySet<string>,
): ReferenceGraph {
  const normalize = (path: string) =>
    path
      .replaceAll("\\", "/")
      .replace(/\/(?:index)(?:\.[^/]+)?$/, "")
      .replace(/\.[^/]+$/, "");
  const candidates = [...candidatePaths];
  const basenameCounts = new Map<string, number>();
  for (const path of candidates) {
    const basename = normalize(path).split("/").at(-1) ?? "";
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
  }
  const unavailable = new Set(graph.unavailablePaths);
  for (const unresolved of graph.unresolved) {
    if (unresolved.resolution !== "unresolved") continue;
    for (const target of unresolved.targetCandidates) {
      const normalizedTarget = normalize(target);
      if (!normalizedTarget) continue;
      const basename = normalizedTarget.split("/").at(-1) ?? "";
      for (const candidate of candidates) {
        const normalizedCandidate = normalize(candidate);
        const relevant = normalizedTarget.includes("/")
          ? normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`)
          : normalizedCandidate === normalizedTarget ||
            (basenameCounts.get(basename) === 1 && normalizedCandidate.endsWith(`/${basename}`));
        if (relevant) unavailable.add(candidate);
      }
    }
  }
  const unavailablePaths = [...unavailable].sort(compareText);
  return { ...graph, complete: graph.complete && unavailablePaths.length === 0, unavailablePaths };
}

/** Produces normalized unavailable evidence for candidates with no reference backend. */
export function unsupportedCandidateReferenceGraph(candidates: readonly ReferenceCandidate[]): ReferenceGraph {
  const unavailablePaths = [
    ...new Set(candidates.filter((candidate) => candidate.language === "unsupported").map((candidate) => candidate.path)),
  ].sort(compareText);
  return emptyReferenceGraph(unavailablePaths);
}
