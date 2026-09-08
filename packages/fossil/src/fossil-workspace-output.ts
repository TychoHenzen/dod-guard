import type { WorkspaceDebrisFinding } from "./types.js";
import type {
  WorkspaceDebrisTableMode,
} from "./fossil-output-types/workspace-debris-table-mode.js";
import type {
  WorkspaceDebrisTableRow,
} from "./fossil-output-types/workspace-debris-table-row.js";
import { normalizedPath } from "./fossil-output-text.js";

function topLevelDirectory(path: string): string | undefined {
  const normalized = normalizedPath(path);
  const separator = normalized.indexOf("/");
  return separator === -1 ? undefined : normalized.slice(0, separator);
}

function findingDirectory(finding: WorkspaceDebrisFinding): string | undefined {
  if (finding.kind !== "ignored") return undefined;
  return topLevelDirectory(finding.path);
}

function ignoredDirectoryCounts(
  findings: readonly WorkspaceDebrisFinding[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const directory = findingDirectory(finding);
    if (directory) counts.set(directory, (counts.get(directory) ?? 0) + 1);
  }
  return counts;
}

function addWorkspaceRow({
  rows,
  finding,
  summarizedDirectories,
  emittedDirectories,
  directoryCounts,
}: {
  rows: WorkspaceDebrisTableRow[];
  finding: WorkspaceDebrisFinding;
  summarizedDirectories: ReadonlySet<string>;
  emittedDirectories: Set<string>;
  directoryCounts: ReadonlyMap<string, number>;
}): void {
  const directory = findingDirectory(finding);
  if (!isSummarized(directory, summarizedDirectories)) {
    rows.push({ kind: "finding", finding });
    return;
  }
  if (emittedDirectories.has(directory)) return;
  emittedDirectories.add(directory);
  rows.push({
    kind: "ignored-directory-summary",
    directory,
    count: directoryCounts.get(directory) ?? 0,
  });
}

function isSummarized(
  directory: string | undefined,
  summarizedDirectories: ReadonlySet<string>,
): directory is string {
  return directory !== undefined && summarizedDirectories.has(directory);
}

/** Produces normal or verbose rows without changing debris findings. */
export function workspaceDebrisTableRows(
  findings: readonly WorkspaceDebrisFinding[],
  mode: WorkspaceDebrisTableMode,
): readonly WorkspaceDebrisTableRow[] {
  if (mode === "verbose")
    return findings.map((finding) => ({ kind: "finding", finding }));
  const directoryCounts = ignoredDirectoryCounts(findings);
  const summarizedDirectories = new Set(
    [...directoryCounts]
      .filter(([, count]) => count >= 20)
      .map(([directory]) => directory),
  );
  const emittedDirectories = new Set<string>();
  const rows: WorkspaceDebrisTableRow[] = [];
  for (const finding of findings)
    addWorkspaceRow({
      rows,
      finding,
      summarizedDirectories,
      emittedDirectories,
      directoryCounts,
    });
  return rows;
}
