import type { GitVersion } from "./git-process-types/index.js";
export { discoverGitRepository } from "./git-process-discovery.js";
export { runGitCommand } from "./git-process-command.js";
export { SAFE_GIT_BASE_ARGUMENTS, safeGitEnvironment, } from "./git-process-environment.js";
export type { CollectedGitOutput } from "./git-process-types/index.js";
export type { GitIngestionLimits } from "./git-process-types/index.js";
export type { GitOutputCollectionOptions } from "./git-process-types/index.js";
export type { GitPipedChild } from "./git-process-types/index.js";
export type { GitSpawn } from "./git-process-types/index.js";
export type { GitSpawnOptions } from "./git-process-types/index.js";
export type { GitVersion } from "./git-process-types/index.js";
export { collectBoundedGitOutput } from "./git-output-collector.js";
export { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";
/** Parses standard Git version evidence for a capability decision. */
export declare function parseGitVersion(output: string): GitVersion | undefined;
/** Rejects version evidence that cannot support history analysis. */
export declare function assertSupportedGitVersion(output: string): GitVersion;
/** Checks Git capability before calling the later history-reading boundary. */
export declare function readHistoryWithSupportedGit<T>(readVersion: () => Promise<string>, readHistory: () => Promise<T>): Promise<T>;
