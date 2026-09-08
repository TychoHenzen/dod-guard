import type { BurstReport } from "./types.js";
import type { BurstTableMode } from "./fossil-output-types/burst-table-mode.js";
import type {
  BurstTableRenderOptions,
} from "./fossil-output-types/burst-table-render-options.js";
import type { BurstTableRow } from "./fossil-output-types/burst-table-row.js";
import { findingTableRows } from "./fossil-burst-finding-rows.js";
import {
  comparePaths,
  normalizedPath,
  terminalSafeText,
  utcDate,
} from "./fossil-output-text.js";

/** Produces deterministic burst, survivor, and candidate rows. */
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
  return isTty ? `\u001b[1m${value}\u001b[0m` : value;
}

function findingExplanationLine(
  row: Extract<BurstTableRow, { kind: "finding-explanation" }>,
): string {
  const timing = row.createdInBurst
    ? "created in burst"
    : "existed before burst";
  const reference =
    row.referenceAvailability === "unavailable"
      ? "reference evidence unavailable"
      : `references: ${row.strongInboundReferences} strong inbound, ` +
        `${row.candidateNeighbors.length} candidate neighbors, ` +
        `${row.liveNeighbors.length} live neighbors`;
  return (
    `    ${timing}; ` +
    `${row.burstCommits} burst commits, ${row.postBurstCommits} post-burst ` +
    `commits; ${reference}`
  );
}

function burstTableLine(row: BurstTableRow, isTty: boolean): string {
  switch (row.kind) {
    case "burst":
      return styleBurstHeader(
        `Burst ${terminalSafeText(row.id)}: ${row.startDate} to ` +
          `${row.endDate}, ${row.commitCount} commits, ${row.fileCount} files`,
        isTty,
      );
    case "survivor":
      return `  survivor ${terminalSafeText(row.path)}`;
    case "finding":
      return (
        `  finding ${terminalSafeText(row.path)}: score ${row.score} ` +
        `(${row.scoreBasis})`
      );
    case "finding-explanation":
      return findingExplanationLine(row);
  }
}

/** Renders burst rows with caller-owned TTY styling control. */
export function renderBurstTableRows(
  rows: readonly BurstTableRow[],
  { isTty }: BurstTableRenderOptions,
): string {
  return rows.map((row) => burstTableLine(row, isTty)).join("\n");
}
