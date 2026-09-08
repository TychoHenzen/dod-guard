import { runGitCommand } from "./git-process-boundary.js";
import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
import { analyzeHistoryStage } from "./repository-analysis-history.js";
import { buildAnalysisReport } from "./repository-analysis-report.js";
import { buildBurstReports } from "./repository-analysis-findings.js";
import { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
import {
  buildWorkspaceDebrisFindings,
} from "./repository-analysis-workspace-findings.js";

/** Composes safe Git, source, scoring, and workspace boundaries. */
export async function analyzeRepositoryCore(
  repositoryPath: string,
  options: NormalizedAnalysisOptions,
  runGit: typeof runGitCommand = runGitCommand,
): Promise<FossilReport> {
  const historyStage = await analyzeHistoryStage(
    repositoryPath,
    options,
    runGit,
  );
  const workspaceStage = await analyzeWorkspaceStage({
    root: historyStage.root,
    options,
    runGit,
    analysisTimestampMs: historyStage.analysisTimestampMs,
  });
  return buildRepositoryReport(historyStage, workspaceStage, options);
}

function buildRepositoryReport(
  historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>,
  workspaceStage: Awaited<ReturnType<typeof analyzeWorkspaceStage>>,
  options: NormalizedAnalysisOptions,
): FossilReport {
  const reports = buildBurstReports(
    historyStage.bursts,
    workspaceStage.references,
    options.threshold,
  );
  const workspaceDebris = buildWorkspaceDebrisFindings({
    candidates: workspaceStage.workspaceCandidates,
    references: workspaceStage.references,
    inventory: workspaceStage.inventory,
    root: historyStage.root,
  });
  return buildAnalysisReport({
    historyStage,
    workspaceStage,
    options,
    reports,
    workspaceDebris,
  });
}
