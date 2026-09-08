import { runGitCommand } from "./git-process-boundary.js";
import { analyzeHistoryStage } from "./repository-analysis-history.js";
import { buildAnalysisReport } from "./repository-analysis-report.js";
import { buildBurstReports } from "./repository-analysis-findings.js";
import { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
import { buildWorkspaceDebrisFindings } from "./repository-analysis-workspace-findings.js";
/** Composes safe Git, source, scoring, and workspace boundaries into a truthful repository report. */
export async function analyzeRepositoryCore(repositoryPath, options, runGit = runGitCommand) {
    const historyStage = await analyzeHistoryStage(repositoryPath, options, runGit);
    const workspaceStage = await analyzeWorkspaceStage(rootFor(historyStage), options, runGit, historyStage.analysisTimestampMs);
    const reports = buildBurstReports(historyStage.bursts, workspaceStage.references, options.threshold);
    const workspaceDebris = buildWorkspaceDebrisFindings(workspaceStage.workspaceCandidates, workspaceStage.references, workspaceStage.inventory, rootFor(historyStage));
    return buildAnalysisReport(historyStage, workspaceStage, options, reports, workspaceDebris);
}
function rootFor(stage) {
    return stage.root;
}
//# sourceMappingURL=repository-analysis.js.map