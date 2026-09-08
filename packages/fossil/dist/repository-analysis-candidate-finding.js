import { createAdvisoryFossilFinding } from "./fossil-grader.js";
import { neighborPaths, referenceAvailability, scoreSubscores, selectedNeighbors, strongInboundCount, } from "./repository-analysis-candidate-scoring.js";
function candidateDetails(input) {
    return {
        burstId: input.burst.id,
        path: input.candidate.path,
        activity: input.candidate,
        score: input.score.score,
        scoreBasis: input.score.basis,
        subscores: input.subscores,
        referenceAvailability: referenceAvailability(input.referenceAvailable),
        ...candidateNeighborDetails(input),
    };
}
function candidateNeighborDetails(input) {
    return {
        strongInboundReferences: strongInboundCount(input.graph, input.candidate.path, input.candidatePaths),
        candidateNeighbors: selectedNeighbors(input.neighbors, input.candidatePaths, true),
        liveNeighbors: selectedNeighbors(input.neighbors, input.candidatePaths, false),
    };
}
export function candidateFinding(input) {
    const scored = scoreSubscores(input);
    const score = scored.score;
    if (!(score && score.score >= input.threshold))
        return [];
    const neighbors = neighborPaths(input.graph, input.candidate.path);
    return [
        createAdvisoryFossilFinding(candidateDetails({
            ...input,
            score,
            subscores: scored.subscores,
            referenceAvailable: scored.reference.available,
            neighbors,
        })),
    ];
}
//# sourceMappingURL=repository-analysis-candidate-finding.js.map