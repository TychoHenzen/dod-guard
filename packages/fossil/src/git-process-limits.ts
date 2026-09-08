import type {
  GitIngestionLimits,
} from "./git-process-types/git-ingestion-limits.js";

export const DEFAULT_GIT_INGESTION_LIMITS: GitIngestionLimits = {
  maximumStdoutBytes: 256 * 1_024 * 1_024,
  maximumStderrBytes: 1_024 * 1_024,
  maximumStatusRecords: 1_000_000,
};
