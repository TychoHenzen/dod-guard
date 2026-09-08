import type { AnalysisWarning, FossilReport } from "./types.js";
import type { analyzeHistoryStage } from "./repository-analysis-history.js";
import type { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
export declare function reportBoundary(repositoryRoot: string, canonicalRepositoryRoot: string): FossilReport["boundary"];
export declare function reportLimits(): FossilReport["limits"];
export declare function reportUsage(historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>, workspaceStage: Awaited<ReturnType<typeof analyzeWorkspaceStage>>): FossilReport["usage"];
export declare function reportCompleteness(warnings: readonly AnalysisWarning[], referenceComplete: boolean): FossilReport["completeness"];
export declare function reportStatistics(historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>, reports: readonly FossilReport["bursts"][number][], workspaceDebris: FossilReport["workspaceDebris"]): FossilReport["statistics"];
