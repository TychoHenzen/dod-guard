/** Exact Git arguments for non-ignored, NUL-delimited untracked paths. */
export const UNTRACKED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--exclude-standard"] as const;

/** Regular-file metadata captured after workspace discovery. */
export interface WorkspaceFileMetadata {
  readonly path: string;
  readonly isRegularFile: boolean;
  readonly modifiedTimestampMs: number;
}

/** An old untracked regular file eligible for later workspace-debris evidence checks. */
export interface UntrackedWorkspaceCandidate {
  readonly path: string;
  readonly kind: "untracked";
  readonly modifiedTimestampMs: number;
}

/** Parses Git's NUL-delimited path output without changing valid path characters. */
export function parseNulDelimitedPaths(output: string): readonly string[] {
  return output.split("\0").filter((path) => path !== "");
}

/** Selects old regular untracked files before later ignore and usage-evidence checks. */
export function oldUntrackedWorkspaceCandidates(
  files: readonly WorkspaceFileMetadata[],
  analysisTimestampMs: number,
  minimumAgeDays: number,
): readonly UntrackedWorkspaceCandidate[] {
  const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
  return files
    .filter((file) => file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs)
    .map(({ path, modifiedTimestampMs }) => ({ path, kind: "untracked", modifiedTimestampMs }));
}
