/** Explicit compatibility boundary for noninteractive Git process helpers. */
export { assertSupportedGitVersion, collectBoundedGitOutput, DEFAULT_GIT_INGESTION_LIMITS, discoverGitRepository, parseGitVersion, readHistoryWithSupportedGit, runGitCommand, SAFE_GIT_BASE_ARGUMENTS, safeGitEnvironment, } from "./git-process.js";
export type { CollectedGitOutput, GitIngestionLimits, GitOutputCollectionOptions, GitPipedChild, GitSpawn, GitSpawnOptions, GitVersion, } from "./git-process.js";
