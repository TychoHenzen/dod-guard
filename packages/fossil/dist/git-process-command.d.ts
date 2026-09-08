import type { CollectedGitOutput } from "./git-process-types/collected-git-output.js";
export declare function runGitCommand({ arguments_, repositoryPath, input, historyMode, }: {
    arguments_: readonly string[];
    repositoryPath?: string;
    input?: string;
    historyMode?: boolean;
}): Promise<CollectedGitOutput>;
