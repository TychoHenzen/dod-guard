import type { GitCommit, GitFileChange } from "../types.js";

export interface FileEvent {
  readonly change: GitFileChange;
  readonly commit: GitCommit;
}
