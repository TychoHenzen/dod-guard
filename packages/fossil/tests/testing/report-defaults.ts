export const defaultLimits = {
  maximumCommits: 0,
  maximumFileStatusRecords: 0,
  maximumInventoriedFiles: 0,
  maximumGitStdoutBytes: 0,
  maximumGitStderrBytes: 0,
  maximumReferenceFileBytes: 0,
  maximumReferenceTotalBytes: 0,
};

export const defaultUsage = {
  commitRecords: 0,
  fileStatusRecords: 0,
  inventoriedFiles: 0,
  gitStdoutBytes: 0,
  gitStderrBytes: 0,
  referenceBytes: 0,
  omittedReferencePaths: 0,
};

export const defaultCompleteness = {
  historyComplete: true,
  referenceAnalysisComplete: true,
  workspaceDebrisComplete: true,
};

export const defaultStatistics = {
  includedCommitCount: 0,
  logicalFileCount: 0,
  burstCount: 0,
  candidateFindingCount: 0,
  uniqueCandidatePathCount: 0,
  workspaceDebrisCount: 0,
};
