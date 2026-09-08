import type { BurstFileActivity } from "./burst-file-activity.js";
import type { GitCommit } from "./git-commit.js";

export interface Burst {
  readonly id: string;
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly commits: readonly GitCommit[];
  readonly files: readonly BurstFileActivity[];
  readonly closed: boolean;
}
