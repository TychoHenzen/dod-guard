import type { CollectedGitOutput } from "./git-process-types/collected-git-output.js";
import type { GitOutputCollectionOptions } from "./git-process-types/git-output-collection-options.js";
import type { GitPipedChild } from "./git-process-types/git-piped-child.js";
/** Collects piped Git output within bounded byte and history-status record limits. */
export declare function collectBoundedGitOutput(child: GitPipedChild, { historyMode, limits: suppliedLimits }?: GitOutputCollectionOptions): Promise<CollectedGitOutput>;
