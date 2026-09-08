import type { CollectedGitOutput } from "./git-process-types/index.js";
export declare function runGitCommand({ arguments_, repositoryPath, input, historyMode, }: {
    arguments_: readonly string[];
    repositoryPath?: string;
    input?: string;
    historyMode?: boolean;
}): Promise<CollectedGitOutput>;
