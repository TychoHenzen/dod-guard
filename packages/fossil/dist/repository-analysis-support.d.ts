import { type CollectedGitOutput, runGitCommand } from "./git-process-boundary.js";
export declare function emptyHistoryOutput(): CollectedGitOutput;
export declare function successfulGit({ runGit, arguments_, repositoryPath, input, historyMode, }: {
    runGit: typeof runGitCommand;
    arguments_: readonly string[];
    repositoryPath?: string;
    input?: string;
    historyMode?: boolean;
}): Promise<CollectedGitOutput>;
