import { FossilAnalysisError } from "./analysis-error.js";
import { type CollectedGitOutput, runGitCommand } from "./git-process-boundary.js";
export declare function gitFailure(message: string): FossilAnalysisError;
export declare function emptyHistoryOutput(): CollectedGitOutput;
export declare function successfulGit(runGit: typeof runGitCommand, arguments_: readonly string[], repositoryPath?: string, input?: string, historyMode?: boolean): Promise<CollectedGitOutput>;
