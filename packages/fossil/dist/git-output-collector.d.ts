import type { CollectedGitOutput, GitOutputCollectionOptions, GitPipedChild } from "./git-process-types/index.js";
/** Collects piped Git output within bounded byte and status-record limits. */
export declare function collectBoundedGitOutput(child: GitPipedChild, { historyMode, limits: suppliedLimits, }?: GitOutputCollectionOptions): Promise<CollectedGitOutput>;
