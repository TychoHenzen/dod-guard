import { finalizeFossilReport } from "./output.js";
import { reportBoundary, reportCompleteness, reportLimits, reportStatistics, reportUsage, } from "./repository-analysis-report-parts.js";
export function buildAnalysisReport(historyStage, workspaceStage, options, reports, workspaceDebris) {
    const warnings = [...historyStage.warnings, ...workspaceStage.warnings];
    return finalizeFossilReport({
        schemaVersion: 1,
        options,
        analysisTimestampMs: historyStage.analysisTimestampMs,
        gitVersion: historyStage.version.stdout.trim(),
        boundary: reportBoundary(historyStage.repositoryPath, historyStage.root),
        limits: reportLimits(),
        usage: reportUsage(historyStage, workspaceStage),
        completeness: reportCompleteness(warnings, workspaceStage.references.graph.complete),
        statistics: reportStatistics(historyStage, reports, workspaceDebris),
        warnings,
        bursts: reports,
        workspaceDebris,
    });
}
//# sourceMappingURL=repository-analysis-report.js.map