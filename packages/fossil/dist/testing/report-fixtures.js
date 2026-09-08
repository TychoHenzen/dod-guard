const defaultLimits = {
    maximumCommits: 0,
    maximumFileStatusRecords: 0,
    maximumInventoriedFiles: 0,
    maximumGitStdoutBytes: 0,
    maximumGitStderrBytes: 0,
    maximumReferenceFileBytes: 0,
    maximumReferenceTotalBytes: 0,
};
const defaultUsage = {
    commitRecords: 0,
    fileStatusRecords: 0,
    inventoriedFiles: 0,
    gitStdoutBytes: 0,
    gitStderrBytes: 0,
    referenceBytes: 0,
    omittedReferencePaths: 0,
};
const defaultCompleteness = {
    historyComplete: true,
    referenceAnalysisComplete: true,
    workspaceDebrisComplete: true,
};
const defaultStatistics = {
    includedCommitCount: 0,
    logicalFileCount: 0,
    burstCount: 0,
    candidateFindingCount: 0,
    uniqueCandidatePathCount: 0,
    workspaceDebrisCount: 0,
};
export function optionsFor(format = "table") {
    return {
        days: 90,
        gapHours: 48,
        threshold: 0.4,
        format,
        extensions: [],
        untrackedAgeDays: 90,
        exclude: [],
        verbose: false,
    };
}
export function advisoryFindingInput(input) {
    return {
        burstId: input.burstId,
        path: input.path,
        activity: {
            identity: `${input.burstId}:${input.path}`,
            path: input.path,
            burstCommits: input.burstCommits,
            postBurstCommits: 0,
            createdInBurst: true,
            existsAtHead: true,
        },
        score: input.score,
        scoreBasis: "full",
        subscores: { churn: 1, abandonment: 1, referenceWeakness: 1, clusterIsolation: 1 },
        referenceAvailability: "complete",
        strongInboundReferences: 0,
        candidateNeighbors: [],
        liveNeighbors: [],
    };
}
export function limitsWith(value) {
    return {
        maximumCommits: value,
        maximumFileStatusRecords: value,
        maximumInventoriedFiles: value,
        maximumGitStdoutBytes: value,
        maximumGitStderrBytes: value,
        maximumReferenceFileBytes: value,
        maximumReferenceTotalBytes: value,
    };
}
export function createReport(options, overrides = {}) {
    return {
        schemaVersion: 1,
        options,
        analysisTimestampMs: 0,
        gitVersion: "2.47.0",
        boundary: { repositoryRoot: "C:/repo", canonicalRepositoryRoot: "C:/repo", unobservedMechanisms: [] },
        limits: { ...defaultLimits },
        usage: { ...defaultUsage },
        completeness: { ...defaultCompleteness },
        statistics: { ...defaultStatistics },
        warnings: [],
        bursts: [],
        workspaceDebris: [],
        ...overrides,
    };
}
//# sourceMappingURL=report-fixtures.js.map