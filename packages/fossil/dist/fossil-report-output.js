import { comparePaths, normalizedPath } from "./fossil-output-text.js";
/** Serializes the versioned report as one machine-readable JSON document. */
export function renderFossilReportJson(report) {
    return JSON.stringify(finalizeFossilReport(report));
}
/** Counts burst-path finding records and their unique normalized candidate paths. */
export function candidateFindingCounts(bursts) {
    const paths = bursts.flatMap((burst) => burst.findings.map((finding) => normalizedPath(finding.path)));
    return { candidateFindingCount: paths.length, uniqueCandidatePathCount: new Set(paths).size };
}
function compareWarnings(left, right) {
    const codeComparison = comparePaths(left.code, right.code);
    if (codeComparison !== 0)
        return codeComparison;
    const pathComparison = compareWarningPaths(left, right);
    if (pathComparison !== 0)
        return pathComparison;
    return comparePaths(left.message, right.message);
}
function compareWarningPaths(left, right) {
    return comparePaths(normalizedPath(left.path ?? ""), normalizedPath(right.path ?? ""));
}
/** Applies the report statistics derived from its burst-path finding records. */
export function finalizeFossilReport(report) {
    return {
        ...report,
        statistics: { ...report.statistics, ...candidateFindingCounts(report.bursts) },
        warnings: [...report.warnings].sort(compareWarnings),
    };
}
//# sourceMappingURL=fossil-report-output.js.map