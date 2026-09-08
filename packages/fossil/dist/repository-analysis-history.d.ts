import { runGitCommand } from "./git-process-boundary.js";
import type { NormalizedAnalysisOptions } from "./types.js";
export declare function analyzeHistoryStage(repositoryPath: string, options: NormalizedAnalysisOptions, runGit?: typeof runGitCommand): Promise<{
    gitOutputs: import("./git-process-boundary.js").CollectedGitOutput[];
    includedHistory: import("./types.js").GitCommit[];
    warnings: import("./types.js").AnalysisWarning[];
    bursts: import("./types.js").Burst[];
    shallow: import("./git-process-boundary.js").CollectedGitOutput;
    sparse: import("./git-process-boundary.js").CollectedGitOutput;
    submodules: import("./git-process-boundary.js").CollectedGitOutput;
    version: import("./git-process-boundary.js").CollectedGitOutput;
    discovery: import("./git-process-boundary.js").CollectedGitOutput;
    prefix: import("./git-process-boundary.js").CollectedGitOutput;
    head: import("./git-process-boundary.js").CollectedGitOutput;
    historyOutput: import("./git-process-boundary.js").CollectedGitOutput;
    analysisTimestampMs: number;
    root: string;
    repositoryPath: string;
}>;
