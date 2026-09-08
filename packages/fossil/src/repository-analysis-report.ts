import { finalizeFossilReport } from "./output.js";
import type { FossilReport } from "./types.js";
import {
  reportBoundary,
  reportCompleteness,
  reportLimits,
  reportStatistics,
  reportUsage,
} from "./repository-analysis-report-parts.js";
import type { AnalysisReportInput } from "./repository-analysis-inputs.js";

export function buildAnalysisReport(input: AnalysisReportInput): FossilReport {
  const { historyStage, workspaceStage, options, reports, workspaceDebris } =
    input;
  const warnings = [...historyStage.warnings, ...workspaceStage.warnings];
  return finalizeFossilReport({
    schemaVersion: 1,
    options,
    analysisTimestampMs: historyStage.analysisTimestampMs,
    gitVersion: historyStage.version.stdout.trim(),
    boundary: reportBoundary(historyStage.repositoryPath, historyStage.root),
    limits: reportLimits(),
    usage: reportUsage(historyStage, workspaceStage),
    completeness: reportCompleteness(
      warnings,
      workspaceStage.references.graph.complete,
    ),
    statistics: reportStatistics(historyStage, reports, workspaceDebris),
    warnings,
    bursts: reports,
    workspaceDebris,
  });
}
