import type { FossilReport } from "../types.js";

export function limitsWith(value: number): FossilReport["limits"] {
  return {
    maximumCommits: value,
    maximumFileStatusRecords: value,
    maximumInventoriedFiles: value,
    maximumGitStdoutBytes: value,
    maximumGitStderrBytes: value,
    maximumReferenceFileBytes: value,
    maximumReferenceTotalBytes: value,
  };
}
