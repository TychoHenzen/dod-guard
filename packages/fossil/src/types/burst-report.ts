import type { BurstFileActivity } from "./burst-file-activity.js";
import type { FossilFinding } from "./fossil-finding.js";

export interface BurstReport {
  readonly id: string;
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly commitCount: number;
  readonly fileCount: number;
  readonly survivors: readonly BurstFileActivity[];
  readonly findings: readonly FossilFinding[];
  readonly deletedPaths: readonly string[];
}
