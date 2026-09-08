import type { GitIngestionLimits } from "./git-ingestion-limits.js";

export interface GitOutputCollectionOptions {
  readonly historyMode?: boolean;
  readonly limits?: Partial<GitIngestionLimits>;
}
