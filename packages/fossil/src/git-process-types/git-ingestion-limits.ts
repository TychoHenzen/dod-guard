export interface GitIngestionLimits {
  readonly maximumStdoutBytes: number;
  readonly maximumStderrBytes: number;
  readonly maximumStatusRecords: number;
}
