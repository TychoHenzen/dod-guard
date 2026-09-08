import * as history from "./git-analyzer.js";
import { runGitCommand } from "./git-process-boundary.js";
import { successfulGit } from "./repository-analysis-support.js";
export { resolveHistoryRepository, } from "./repository-analysis-history-repository.js";
export declare function sparseCheckoutOutput(runGit: typeof runGitCommand, root: string): Promise<import("./git-process-boundary.js").CollectedGitOutput>;
export declare function historyWarnings({ includedHistory, analysisTimestampMs, shallow, sparse, submodules, }: {
    includedHistory: ReturnType<typeof history.filterHistoryByExtensions>;
    analysisTimestampMs: number;
    shallow: Awaited<ReturnType<typeof successfulGit>>;
    sparse: Awaited<ReturnType<typeof successfulGit>>;
    submodules: Awaited<ReturnType<typeof successfulGit>>;
}): import("./types.js").AnalysisWarning[];
export declare function historyBursts(includedHistory: ReturnType<typeof history.filterHistoryByExtensions>, analysisTimestampMs: number, gapHours: number): import("./types.js").Burst[];
