import { runGitCommand } from "./git-process-boundary.js";
import type { NormalizedAnalysisOptions } from "./types.js";
export declare function analyzeHistoryStage(repositoryPath: string, options: NormalizedAnalysisOptions, runGit?: typeof runGitCommand): Promise<{
    repositoryPath: string;
    version: import("./git-process-boundary.js").CollectedGitOutput;
    discovery: import("./git-process-boundary.js").CollectedGitOutput;
    prefix: import("./git-process-boundary.js").CollectedGitOutput;
    head: import("./git-process-boundary.js").CollectedGitOutput;
    historyOutput: import("./git-process-boundary.js").CollectedGitOutput;
    shallow: import("./git-process-boundary.js").CollectedGitOutput;
    sparse: import("./git-process-boundary.js").CollectedGitOutput | {
        stdout: string;
        stdoutBytes: number;
        stderrBytes: number;
    };
    submodules: import("./git-process-boundary.js").CollectedGitOutput;
    includedHistory: import("./types.js").GitCommit[];
    analysisTimestampMs: number;
    root: string;
    warnings: import("./types.js").AnalysisWarning[];
    bursts: import("./types.js").Burst[];
    gitOutputs: (import("./git-process-boundary.js").CollectedGitOutput | {
        stdout: string;
        stdoutBytes: number;
        stderrBytes: number;
    })[];
}>;
