import { runGitCommand } from "./git-process-boundary.js";
export declare function resolveHistoryRepository(repositoryPath: string, runGit: typeof runGitCommand): Promise<{
    version: import("./git-process-boundary.js").CollectedGitOutput;
    discovery: import("./git-process-boundary.js").CollectedGitOutput;
    prefix: import("./git-process-boundary.js").CollectedGitOutput;
    head: import("./git-process-boundary.js").CollectedGitOutput;
    historyOutput: import("./git-process-boundary.js").CollectedGitOutput;
    analysisTimestampMs: number;
    root: string;
}>;
