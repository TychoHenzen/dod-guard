export declare const defaultLimits: {
    maximumCommits: number;
    maximumFileStatusRecords: number;
    maximumInventoriedFiles: number;
    maximumGitStdoutBytes: number;
    maximumGitStderrBytes: number;
    maximumReferenceFileBytes: number;
    maximumReferenceTotalBytes: number;
};
export declare const defaultUsage: {
    commitRecords: number;
    fileStatusRecords: number;
    inventoriedFiles: number;
    gitStdoutBytes: number;
    gitStderrBytes: number;
    referenceBytes: number;
    omittedReferencePaths: number;
};
export declare const defaultCompleteness: {
    historyComplete: boolean;
    referenceAnalysisComplete: boolean;
    workspaceDebrisComplete: boolean;
};
export declare const defaultStatistics: {
    includedCommitCount: number;
    logicalFileCount: number;
    burstCount: number;
    candidateFindingCount: number;
    uniqueCandidatePathCount: number;
    workspaceDebrisCount: number;
};
