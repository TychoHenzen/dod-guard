import type { BurstReport, FossilReport, WorkspaceDebrisFinding } from "./types.js";

/** Presentation modes that control workspace-debris table detail. */
export type WorkspaceDebrisTableMode = "normal" | "verbose";
export type BurstTableMode = "normal" | "verbose";

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
    }
  | {
      readonly kind: "finding-explanation";
      readonly createdInBurst: boolean;
      readonly burstCommits: number;
      readonly postBurstCommits: number;
      readonly referenceAvailability: "complete" | "unavailable";
      readonly strongInboundReferences: number;
      readonly candidateNeighbors: readonly string[];
      readonly liveNeighbors: readonly string[];
    };

export interface BurstTableRenderOptions {
  readonly isTty: boolean;
}

export interface CandidateFindingCounts {
  readonly candidateFindingCount: number;
  readonly uniqueCandidatePathCount: number;
}

const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";

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

function findingTableRows(burst: BurstReport, mode: BurstTableMode): BurstTableRow[] {
  return burst.findings
    .map((finding) => ({ ...finding, normalizedPath: normalizedPath(finding.path) }))
    .sort((left, right) => right.score - left.score || comparePaths(left.normalizedPath, right.normalizedPath))
    .flatMap((finding) => {
      const row: BurstTableRow = {
        kind: "finding",
        path: finding.normalizedPath,
        score: finding.score,
        scoreBasis: finding.scoreBasis,
      };
      if (mode === "normal") return [row];
      return [
        row,
        {
          kind: "finding-explanation",
          createdInBurst: finding.activity.createdInBurst,
          burstCommits: finding.activity.burstCommits,
          postBurstCommits: finding.activity.postBurstCommits,
          referenceAvailability: finding.referenceAvailability,
          strongInboundReferences: finding.strongInboundReferences,
          candidateNeighbors: finding.candidateNeighbors.map(normalizedPath).sort(comparePaths),
          liveNeighbors: finding.liveNeighbors.map(normalizedPath).sort(comparePaths),
        },
      ];
    });
}

/** Produces deterministic burst, survivor, and candidate rows in their required table order. */
export function burstTableRows(
  bursts: readonly BurstReport[],
  mode: BurstTableMode = "normal",
): readonly BurstTableRow[] {
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
      ...findingTableRows(burst, mode),
    ]);
}

function styleBurstHeader(value: string, isTty: boolean): string {
  return isTty ? `${BOLD}${value}${RESET}` : value;
}

function burstTableLine(row: BurstTableRow, isTty: boolean): string {
  switch (row.kind) {
    case "burst":
      return styleBurstHeader(
        `Burst ${row.id}: ${row.startDate} to ${row.endDate}, ${row.commitCount} commits, ${row.fileCount} files`,
        isTty,
      );
    case "survivor":
      return `  survivor ${row.path}`;
    case "finding":
      return `  finding ${row.path}: score ${row.score} (${row.scoreBasis})`;
    case "finding-explanation": {
      const reference =
        row.referenceAvailability === "unavailable"
          ? "reference evidence unavailable"
          : `references: ${row.strongInboundReferences} strong inbound, ${row.candidateNeighbors.length} candidate neighbors, ${row.liveNeighbors.length} live neighbors`;
      return `    ${row.createdInBurst ? "created in burst" : "existed before burst"}; ${row.burstCommits} burst commits, ${row.postBurstCommits} post-burst commits; ${reference}`;
    }
  }
}

/** Renders current burst table rows with explicit caller-owned TTY styling control. */
export function renderBurstTableRows(rows: readonly BurstTableRow[], { isTty }: BurstTableRenderOptions): string {
  return rows.map((row) => burstTableLine(row, isTty)).join("\n");
}

/** Serializes the versioned report as one machine-readable JSON document. */
export function renderFossilReportJson(report: FossilReport): string {
  const candidateCounts = candidateFindingCounts(report.bursts);
  return JSON.stringify({ ...report, statistics: { ...report.statistics, ...candidateCounts } });
}

/** Counts burst-path finding records and their unique normalized candidate paths. */
export function candidateFindingCounts(bursts: readonly BurstReport[]): CandidateFindingCounts {
  const paths = bursts.flatMap((burst) => burst.findings.map((finding) => normalizedPath(finding.path)));
  return { candidateFindingCount: paths.length, uniqueCandidatePathCount: new Set(paths).size };
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
