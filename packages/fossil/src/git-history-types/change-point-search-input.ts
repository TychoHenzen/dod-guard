import type { GitCommit, GitFileChange } from "../types.js";

export interface ChangePointSearchInput {
  commits: readonly GitCommit[];
  start: number;
  end: number;
  identities: ReadonlyMap<GitFileChange, string>;
}
