import type { IgnoreSource } from "./types.js";
import type { IgnoreProvenance } from "./workspace-types/ignore-provenance.js";
import type {
  UntrackedWorkspaceCandidate,
  WorkspaceFileMetadata,
} from "./workspace-types/index.js";
import { normalizeWorkspacePath } from "./workspace-path-rules.js";
export * from "./workspace-ignore-candidates.js";

function isAbsoluteWorkspacePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

function isLocalExclude(path: string): boolean {
  if (path === ".git/info/exclude") return true;
  return path.endsWith("/.git/info/exclude");
}

function classifyIgnoreSource(
  sourcePath: string,
  globalExcludePath: string | undefined,
): IgnoreSource {
  const normalizedSource = normalizeWorkspacePath(sourcePath);
  if (isLocalExclude(normalizedSource)) return "local-exclude";
  if (globalExcludePath) {
    if (normalizeWorkspacePath(globalExcludePath) === normalizedSource)
      return "global-exclude";
  }
  if (!isAbsoluteWorkspacePath(normalizedSource)) return "repository";
  return "unknown";
}

function provenanceEntry(
  fields: readonly string[],
  index: number,
  globalExcludePath: string | undefined,
): IgnoreProvenance | undefined {
  const sourcePath = fields[index];
  const rule = fields[index + 2];
  const path = fields[index + 3];
  if (!sourcePath) return undefined;
  if (rule === undefined) return undefined;
  if (path === undefined) return undefined;
  return {
    path,
    rule,
    source: classifyIgnoreSource(sourcePath, globalExcludePath),
  };
}

/** Parses NUL-delimited source, line, rule, and path records. */
export function parseVerboseCheckIgnore(
  output: string,
  globalExcludePath?: string,
): readonly IgnoreProvenance[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const provenance: IgnoreProvenance[] = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const entry = provenanceEntry(fields, index, globalExcludePath);
    if (entry) provenance.push(entry);
  }
  return provenance;
}

/** Selects old regular untracked files for later evidence checks. */
export function oldUntrackedWorkspaceCandidates(
  files: readonly WorkspaceFileMetadata[],
  analysisTimestampMs: number,
  minimumAgeDays: number,
): readonly UntrackedWorkspaceCandidate[] {
  const cutoffTimestampMs =
    analysisTimestampMs - minimumAgeDays * 24 * 60 * 60 * 1_000;
  return files
    .filter(
      (file) =>
        file.isRegularFile && file.modifiedTimestampMs <= cutoffTimestampMs,
    )
    .map(({ path, modifiedTimestampMs }) => ({
      path,
      kind: "untracked",
      modifiedTimestampMs,
    }));
}
