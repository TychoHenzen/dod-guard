import { runGitCommand } from "./git-process-boundary.js";
import { analyzeHistoryStage } from "./repository-analysis-history.js";
import { buildAnalysisReport } from "./repository-analysis-report.js";
import { buildBurstReports } from "./repository-analysis-findings.js";
import { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
import * as debris from "./repository-analysis-workspace-findings.js";
/** Composes safe Git, source, scoring, and workspace boundaries. */
export async function analyzeRepositoryCore(repositoryPath, options, runGit = runGitCommand) {
    const historyStage = await analyzeHistoryStage(repositoryPath, options, runGit);
    const workspaceStage = await analyzeWorkspaceStage({
        root: historyStage.root,
        options,
        runGit,
        analysisTimestampMs: historyStage.analysisTimestampMs,
    });
    return buildRepositoryReport(historyStage, workspaceStage, options);
}
function buildRepositoryReport(historyStage, workspaceStage, options) {
    const reports = buildBurstReports(historyStage.bursts, workspaceStage.references, options.threshold);
    const workspaceDebris = debris.buildWorkspaceDebrisFindings({
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
//# sourceMappingURL=repository-analysis.js.map