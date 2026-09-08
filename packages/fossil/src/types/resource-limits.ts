export interface ResourceLimits {
  readonly maximumCommits: number;
  readonly maximumFileStatusRecords: number;
  readonly maximumInventoriedFiles: number;
  readonly maximumGitStdoutBytes: number;
  readonly maximumGitStderrBytes: number;
  readonly maximumReferenceFileBytes: number;
  readonly maximumReferenceTotalBytes: number;
}
