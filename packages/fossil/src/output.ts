import type { BurstReport, WorkspaceDebrisFinding } from "./types.js";

/** Presentation modes that control workspace-debris table detail. */
export type WorkspaceDebrisTableMode = "normal" | "verbose";

/** A table row either keeps one finding or summarizes a large ignored directory. */
export type WorkspaceDebrisTableRow =
  | { readonly kind: "finding"; readonly finding: WorkspaceDebrisFinding }
  | { readonly kind: "ignored-directory-summary"; readonly directory: string; readonly count: number };

/** One typed row in a burst table, kept together in report order. */
export type BurstTableRow =
  | {
      readonly kind: "burst";
      readonly id: string;
      readonly startDate: string;
      readonly endDate: string;
      readonly commitCount: number;
      readonly fileCount: number;
    }
  | { readonly kind: "survivor"; readonly path: string }
  | {
      readonly kind: "finding";
      readonly path: string;
      readonly score: number;
      readonly scoreBasis: "full" | "git-only";
    };

function topLevelDirectory(path: string): string | undefined {
  const normalized = normalizedPath(path);
  const separator = normalized.indexOf("/");
  return separator === -1 ? undefined : normalized.slice(0, separator);
}

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utcDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

/** Produces deterministic burst, survivor, and candidate rows in their required table order. */
export function burstTableRows(bursts: readonly BurstReport[]): readonly BurstTableRow[] {
  return [...bursts]
    .sort(
      (left, right) =>
        right.endTimestampMs - left.endTimestampMs ||
        right.startTimestampMs - left.startTimestampMs ||
        comparePaths(left.id, right.id),
    )
    .flatMap((burst) => [
      {
        kind: "burst" as const,
        id: burst.id,
        startDate: utcDate(burst.startTimestampMs),
        endDate: utcDate(burst.endTimestampMs),
        commitCount: burst.commitCount,
        fileCount: burst.fileCount,
      },
      ...burst.survivors
        .map((survivor) => normalizedPath(survivor.path))
        .sort(comparePaths)
        .map((path) => ({ kind: "survivor" as const, path })),
      ...burst.findings
        .map((finding) => ({ ...finding, normalizedPath: normalizedPath(finding.path) }))
        .sort((left, right) => right.score - left.score || comparePaths(left.normalizedPath, right.normalizedPath))
        .map(({ normalizedPath: path, score, scoreBasis }) => ({ kind: "finding" as const, path, score, scoreBasis })),
    ]);
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
