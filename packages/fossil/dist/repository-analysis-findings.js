import * as history from "./git-analyzer.js";
import { markUnresolvedCandidateEvidence, regradeVestigialEdges } from "./ref-analyzer.js";
import { candidateFinding } from "./repository-analysis-candidate-finding.js";
function buildBurstReport(burst, references, threshold) {
    const candidates = history.selectFossilCandidates(burst.files);
    const candidatePaths = new Set(candidates.map((candidate) => candidate.path));
    const graph = markUnresolvedCandidateEvidence(regradeVestigialEdges(references.graph, candidatePaths), candidatePaths);
    const findings = candidates.flatMap((candidate) => candidateFinding({ candidate, burst, graph, candidatePaths, threshold }));
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
}
export function buildBurstReports(bursts, references, threshold) {
    return bursts.map((burst) => buildBurstReport(burst, references, threshold));
}
//# sourceMappingURL=repository-analysis-findings.js.map