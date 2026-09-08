/** Explicit compatibility boundary for noninteractive Git process helpers. */
export { assertSupportedGitVersion, collectBoundedGitOutput, DEFAULT_GIT_INGESTION_LIMITS, discoverGitRepository, parseGitVersion, readHistoryWithSupportedGit, runGitCommand, SAFE_GIT_BASE_ARGUMENTS, safeGitEnvironment, } from "./git-process.js";
export type { CollectedGitOutput } from "./git-process.js";
export type { GitIngestionLimits } from "./git-process.js";
export type { GitOutputCollectionOptions } from "./git-process.js";
export type { GitPipedChild } from "./git-process.js";
export type { GitSpawn } from "./git-process.js";
export type { GitSpawnOptions } from "./git-process.js";
export type { GitVersion } from "./git-process.js";
