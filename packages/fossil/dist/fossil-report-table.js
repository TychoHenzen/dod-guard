import { burstTableRows, renderBurstTableRows, terminalSafeText, workspaceDebrisTableRows, } from "./fossil-output-core.js";
/** Renders report statistics, bursts, warnings, and workspace debris in table order. */
export function renderFossilReportTable(report, options) {
    const lines = statisticsLines(report);
    const bursts = renderBurstTableRows(burstTableRows(report.bursts, report.options.verbose ? "verbose" : "normal"), options);
    if (bursts)
        lines.push(bursts);
    if (report.warnings.length > 0)
        lines.push("Warnings:", ...report.warnings.map(warningTableLine));
    if (report.workspaceDebris.length > 0)
        lines.push("Workspace debris:", ...workspaceDebrisTableRows(report.workspaceDebris, report.options.verbose ? "verbose" : "normal").map(debrisTableLine));
    return lines.join("\n");
}
function statisticsLines(report) {
    return [
        `Repository statistics: ${report.statistics.includedCommitCount} commits, ${report.statistics.logicalFileCount} logical files, ${report.statistics.burstCount} bursts`,
        `Candidate findings: ${report.statistics.candidateFindingCount} (${report.statistics.uniqueCandidatePathCount} unique paths)`,
        `Workspace debris: ${report.statistics.workspaceDebrisCount}`,
    ];
}
function warningTableLine(warning) {
    return `  ${terminalSafeText(warning.code)}${warning.path ? ` ${terminalSafeText(warning.path)}` : ""}: ${terminalSafeText(warning.message)}`;
}
function debrisTableLine(row) {
    if (row.kind === "ignored-directory-summary")
        return `  ignored directory ${terminalSafeText(row.directory)}: ${row.count} findings`;
    return `  ${terminalSafeText(row.finding.kind)} ${terminalSafeText(row.finding.path)}: ${terminalSafeText(row.finding.review)}`;
}
//# sourceMappingURL=fossil-report-table.js.map