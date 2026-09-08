import type {
  GitCommit,
  GitFileChange,
  LogicalFileActivity,
} from "../types.js";
import type { LogicalIdentityResolution } from "./git-history-resolution.js";

export interface BurstFileInput {
  identity: string;
  changes: readonly GitFileChange[];
  commits: readonly GitCommit[];
  fullChronologicalHistory: readonly GitCommit[];
  finalIndex: number;
  activitiesByIdentity: ReadonlyMap<string, LogicalFileActivity>;
  resolution: LogicalIdentityResolution;
}
