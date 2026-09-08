import { finalizeFossilReport } from "./output.js";
import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
import type { analyzeHistoryStage } from "./repository-analysis-history.js";
import type { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
import {
  reportBoundary,
  reportCompleteness,
  reportLimits,
  reportStatistics,
  reportUsage,
} from "./repository-analysis-report-parts.js";

export function buildAnalysisReport(
  historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>,
  workspaceStage: Awaited<ReturnType<typeof analyzeWorkspaceStage>>,
  options: NormalizedAnalysisOptions,
  reports: readonly FossilReport["bursts"][number][],
  workspaceDebris: FossilReport["workspaceDebris"],
): FossilReport {
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
