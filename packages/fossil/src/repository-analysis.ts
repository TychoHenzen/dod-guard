import { runGitCommand } from "./git-process-boundary.js";
import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
import { analyzeHistoryStage } from "./repository-analysis-history.js";
import { buildAnalysisReport } from "./repository-analysis-report.js";
import { buildBurstReports } from "./repository-analysis-findings.js";
import { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
import { buildWorkspaceDebrisFindings } from "./repository-analysis-workspace-findings.js";

/** Composes safe Git, source, scoring, and workspace boundaries into a truthful repository report. */
export async function analyzeRepositoryCore(
  repositoryPath: string,
  options: NormalizedAnalysisOptions,
  runGit: typeof runGitCommand = runGitCommand,
): Promise<FossilReport> {
  const historyStage = await analyzeHistoryStage(repositoryPath, options, runGit);
  const workspaceStage = await analyzeWorkspaceStage({
    root: rootFor(historyStage),
    options,
    runGit,
    analysisTimestampMs: historyStage.analysisTimestampMs,
  });
  const reports = buildBurstReports(historyStage.bursts, workspaceStage.references, options.threshold);
  const workspaceDebris = buildWorkspaceDebrisFindings({
    candidates: workspaceStage.workspaceCandidates,
    references: workspaceStage.references,
    inventory: workspaceStage.inventory,
    root: rootFor(historyStage),
  });
  return buildAnalysisReport({ historyStage, workspaceStage, options, reports, workspaceDebris });
}

function rootFor(stage: Awaited<ReturnType<typeof analyzeHistoryStage>>): string {
  return stage.root;
}
