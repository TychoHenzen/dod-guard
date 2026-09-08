import type { BurstReport, FossilReport } from "./types.js";
import { comparePaths, normalizedPath } from "./fossil-output-text.js";

/** Serializes the versioned report as one machine-readable JSON document. */
export function renderFossilReportJson(report: FossilReport): string {
  return JSON.stringify(finalizeFossilReport(report));
}

export function candidateFindingCounts(bursts: readonly BurstReport[]) {
  const paths = bursts.flatMap((burst) =>
    burst.findings.map((finding) => normalizedPath(finding.path)),
  );
  return {
    candidateFindingCount: paths.length,
    uniqueCandidatePathCount: new Set(paths).size,
  };
}

function compareWarnings(
  left: FossilReport["warnings"][number],
  right: FossilReport["warnings"][number],
): number {
  const codeComparison = comparePaths(left.code, right.code);
  if (codeComparison !== 0) return codeComparison;
  const pathComparison = compareWarningPaths(left, right);
  if (pathComparison !== 0) return pathComparison;
  return comparePaths(left.message, right.message);
}

function compareWarningPaths(
  left: FossilReport["warnings"][number],
  right: FossilReport["warnings"][number],
): number {
  return comparePaths(
    normalizedPath(left.path ?? ""),
    normalizedPath(right.path ?? ""),
  );
}

/** Applies statistics derived from burst findings. */
export function finalizeFossilReport(report: FossilReport): FossilReport {
  return {
    ...report,
    statistics: {
      ...report.statistics,
      ...candidateFindingCounts(report.bursts),
    },
    warnings: [...report.warnings].sort(compareWarnings),
  };
}
