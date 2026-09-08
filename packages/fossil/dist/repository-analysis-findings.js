import * as history from "./git-analyzer.js";
import { abandonmentScore, candidateReferenceSubscores, createAdvisoryFossilFinding, normalizedBurstChurn, scoreFossilSubscores, } from "./fossil-grader.js";
import { markUnresolvedCandidateEvidence, regradeVestigialEdges } from "./ref-analyzer.js";
export function buildBurstReports(bursts, references, threshold) {
    return bursts.map((burst) => {
        const candidates = history.selectFossilCandidates(burst.files);
        const candidatePaths = new Set(candidates.map((candidate) => candidate.path));
        const graph = markUnresolvedCandidateEvidence(regradeVestigialEdges(references.graph, candidatePaths), candidatePaths);
        const findings = candidates.flatMap((candidate) => {
            const reference = candidateReferenceSubscores(candidate.path, graph, candidatePaths);
            const score = scoreFossilSubscores({
                churn: normalizedBurstChurn(candidate, burst.files),
                abandonment: abandonmentScore(candidate),
                ...(reference.available
                    ? { referenceWeakness: reference.referenceWeakness, clusterIsolation: reference.clusterIsolation }
                    : {}),
            });
            if (!(score && score.score >= threshold))
                return [];
            const inbound = new Set(graph.edges
                .filter((edge) => edge.targetPath === candidate.path && edge.strength === "strong" && !candidatePaths.has(edge.sourcePath))
                .map((edge) => edge.sourcePath));
            const neighbors = new Set(graph.edges.flatMap((edge) => edge.sourcePath === candidate.path
                ? [edge.targetPath]
                : edge.targetPath === candidate.path
                    ? [edge.sourcePath]
                    : []));
            return [
                createAdvisoryFossilFinding({
                    burstId: burst.id,
                    path: candidate.path,
                    activity: candidate,
                    score: score.score,
                    scoreBasis: score.basis,
                    subscores: {
                        churn: normalizedBurstChurn(candidate, burst.files),
                        abandonment: abandonmentScore(candidate),
                        ...(reference.available
                            ? { referenceWeakness: reference.referenceWeakness, clusterIsolation: reference.clusterIsolation }
                            : {}),
                    },
                    referenceAvailability: reference.available ? "complete" : "unavailable",
                    strongInboundReferences: inbound.size,
                    candidateNeighbors: [...neighbors].filter((path) => candidatePaths.has(path)).sort(),
                    liveNeighbors: [...neighbors].filter((path) => !candidatePaths.has(path)).sort(),
                }),
            ];
        });
        return {
            id: burst.id,
            startTimestampMs: burst.startTimestampMs,
            endTimestampMs: burst.endTimestampMs,
            commitCount: burst.commits.length,
            fileCount: burst.files.length,
            survivors: history.selectSurvivors(burst.files),
            findings,
            deletedPaths: history.selectDeletedNonSurvivorPaths(burst.files),
        };
    });
}
//# sourceMappingURL=repository-analysis-findings.js.map