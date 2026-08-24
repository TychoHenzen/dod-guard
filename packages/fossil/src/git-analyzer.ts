import type { GitCommit, GitFileChange } from "./types.js";

const RECORD_SEPARATOR = "\u001e";

/** Arguments for the raw history stream consumed by parseNonMergeGitLog(). */
export function nonMergeGitLogArguments(): readonly string[] {
  return ["log", "HEAD", "--no-merges", "--format=%x1e%H%x00%ct%x00", "--name-status", "-z"];
}

function statusFor(rawStatus: string): GitFileChange["status"] {
  switch (rawStatus[0]) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "unknown";
  }
}

function parseChanges(tokens: readonly string[]): GitFileChange[] {
  const changes: GitFileChange[] = [];
  for (let index = 0; index < tokens.length; ) {
    const rawStatus = tokens[index]?.replace(/^\r?\n/, "");
    if (!rawStatus) {
      index += 1;
      continue;
    }
    const status = statusFor(rawStatus);
    const firstPath = tokens[index + 1];
    if (firstPath === undefined) break;
    if (status === "renamed" || status === "copied") {
      const path = tokens[index + 2];
      if (path === undefined) break;
      changes.push({ status, path, previousPath: firstPath });
      index += 3;
      continue;
    }
    changes.push({ status, path: firstPath });
    index += 2;
  }
  return changes;
}

/** Parses the NUL-delimited non-merge stream requested by nonMergeGitLogArguments(). */
export function parseNonMergeGitLog(rawLog: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const record of rawLog.split(RECORD_SEPARATOR)) {
    if (!record) continue;
    const tokens = record.split("\0");
    const hash = tokens[0];
    const committerSeconds = Number(tokens[1]);
    if (!(hash && Number.isFinite(committerSeconds))) continue;
    commits.push({
      hash,
      committerTimestampMs: committerSeconds * 1_000,
      changes: parseChanges(tokens.slice(2)),
    });
  }
  return commits;
}
