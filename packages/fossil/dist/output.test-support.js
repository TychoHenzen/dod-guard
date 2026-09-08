export function finding(path, kind) {
    return {
        classification: "advisory",
        review: "possible workspace debris",
        path,
        kind,
        modifiedTimestampMs: 0,
        ageSource: "mtime",
        ageUncertainty: "mtime only",
        detectedReferenceEvidence: [],
        analysisBoundary: "C:/repo",
        unobservedReferenceMechanisms: [],
    };
}
export function findingExplanation(candidatePath, livePath) {
    return {
        kind: "finding-explanation",
        createdInBurst: true,
        burstCommits: 2,
        postBurstCommits: 0,
        referenceAvailability: "complete",
        strongInboundReferences: 1,
        candidateNeighbors: [candidatePath],
        liveNeighbors: [livePath],
    };
}
//# sourceMappingURL=output.test-support.js.map