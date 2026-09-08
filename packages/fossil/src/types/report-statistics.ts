export interface ReportStatistics {
  readonly includedCommitCount: number;
  readonly logicalFileCount: number;
  readonly burstCount: number;
  readonly candidateFindingCount: number;
  readonly uniqueCandidatePathCount: number;
  readonly workspaceDebrisCount: number;
}
