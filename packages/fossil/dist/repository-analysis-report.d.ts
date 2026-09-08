import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
import type { analyzeHistoryStage } from "./repository-analysis-history.js";
import type { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
export declare function buildAnalysisReport({ historyStage, workspaceStage, options, reports, workspaceDebris }: {
    historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>;
    workspaceStage: Awaited<ReturnType<typeof analyzeWorkspaceStage>>;
    options: NormalizedAnalysisOptions;
    reports: readonly FossilReport["bursts"][number][];
    workspaceDebris: FossilReport["workspaceDebris"];
}): FossilReport;
