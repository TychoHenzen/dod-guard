import type { IgnoreSource } from "./types.js";

/** Exact Git arguments for non-ignored, NUL-delimited untracked paths. */
export const UNTRACKED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--exclude-standard"] as const;
/** Exact Git arguments for ignored, NUL-delimited workspace paths. */
export const IGNORED_DISCOVERY_ARGUMENTS = ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"] as const;
/** Exact Git arguments for NUL-delimited verbose ignore provenance. */
export const CHECK_IGNORE_ARGUMENTS = ["check-ignore", "-z", "-v", "--stdin"] as const;

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

/** Matching ignore-rule provenance for one ignored workspace path. */
export interface IgnoreProvenance {
  readonly path: string;
  readonly rule: string;
  readonly source: IgnoreSource;
}

/** An old ignored regular file eligible for later workspace-debris evidence checks. */
export interface IgnoredWorkspaceCandidate {
  readonly path: string;
  readonly kind: "ignored";
  readonly modifiedTimestampMs: number;
  readonly ignore: { readonly rule: string; readonly source: IgnoreSource };
}

/** Parses Git's NUL-delimited path output without changing valid path characters. */
export function parseNulDelimitedPaths(output: string): readonly string[] {
  return output.split("\0").filter((path) => path !== "");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function classifyIgnoreSource(sourcePath: string, globalExcludePath: string | undefined): IgnoreSource {
  const normalizedSource = normalizePath(sourcePath);
  if (normalizedSource === ".git/info/exclude" || normalizedSource.endsWith("/.git/info/exclude"))
    return "local-exclude";
  if (globalExcludePath && normalizePath(globalExcludePath) === normalizedSource) return "global-exclude";
  if (!(normalizedSource.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSource))) return "repository";
  return "unknown";
}

/** Parses NUL-delimited source, line, rule, and path records from verbose Git ignore output. */
export function parseVerboseCheckIgnore(output: string, globalExcludePath?: string): readonly IgnoreProvenance[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const provenance: IgnoreProvenance[] = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const sourcePath = fields[index];
    const rule = fields[index + 2];
    const path = fields[index + 3];
    if (!(sourcePath && rule !== undefined && path !== undefined)) continue;
    provenance.push({ path, rule, source: classifyIgnoreSource(sourcePath, globalExcludePath) });
  }
  return provenance;
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

/** Selects old regular ignored files and preserves their matching Git ignore rule provenance. */
export function oldIgnoredWorkspaceCandidates(
  files: readonly WorkspaceFileMetadata[],
  provenance: readonly IgnoreProvenance[],
  analysisTimestampMs: number,
  minimumAgeDays: number,
): readonly IgnoredWorkspaceCandidate[] {
  const provenanceByPath = new Map(provenance.map((entry) => [entry.path, entry]));
  const cutoffTimestampMs = analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
  return files.flatMap((file) => {
    const ignore = provenanceByPath.get(file.path);
    if (!(file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs && ignore)) return [];
    return [
      {
        path: file.path,
        kind: "ignored" as const,
        modifiedTimestampMs: file.modifiedTimestampMs,
        ignore: { rule: ignore.rule, source: ignore.source },
      },
    ];
  });
}
