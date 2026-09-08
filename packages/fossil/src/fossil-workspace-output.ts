import type { WorkspaceDebrisFinding } from "./types.js";
import type { WorkspaceDebrisTableMode } from "./fossil-output-types/workspace-debris-table-mode.js";
import type { WorkspaceDebrisTableRow } from "./fossil-output-types/workspace-debris-table-row.js";
import { normalizedPath } from "./fossil-output-text.js";

function topLevelDirectory(path: string): string | undefined {
  const normalized = normalizedPath(path);
  const separator = normalized.indexOf("/");
  return separator === -1 ? undefined : normalized.slice(0, separator);
}

/** Produces normal or verbose table rows without changing the underlying debris findings. */
export function workspaceDebrisTableRows(
  findings: readonly WorkspaceDebrisFinding[],
  mode: WorkspaceDebrisTableMode,
): readonly WorkspaceDebrisTableRow[] {
  if (mode === "verbose") return findings.map((finding) => ({ kind: "finding", finding }));
  const ignoredDirectoryCounts = new Map<string, number>();
  for (const finding of findings) {
    const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : undefined;
    if (directory) ignoredDirectoryCounts.set(directory, (ignoredDirectoryCounts.get(directory) ?? 0) + 1);
  }
  const summarizedDirectories = new Set(
    [...ignoredDirectoryCounts].filter(([, count]) => count >= 20).map(([directory]) => directory),
  );
  const emittedDirectories = new Set<string>();
  const rows: WorkspaceDebrisTableRow[] = [];
  for (const finding of findings) {
    const directory = finding.kind === "ignored" ? topLevelDirectory(finding.path) : undefined;
    if (!(directory && summarizedDirectories.has(directory))) {
      rows.push({ kind: "finding", finding });
      continue;
    }
    if (emittedDirectories.has(directory)) continue;
    emittedDirectories.add(directory);
    rows.push({ kind: "ignored-directory-summary", directory, count: ignoredDirectoryCounts.get(directory) ?? 0 });
  }
  return rows;
}
