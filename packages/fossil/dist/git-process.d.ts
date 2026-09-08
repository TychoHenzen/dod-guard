import { type ChildProcess } from "node:child_process";
import type { CollectedGitOutput } from "./git-process-types/collected-git-output.js";
import type { GitSpawn } from "./git-process-types/git-spawn.js";
import type { GitVersion } from "./git-process-types/git-version.js";
export type { CollectedGitOutput } from "./git-process-types/index.js";
export type { GitIngestionLimits } from "./git-process-types/index.js";
export type { GitOutputCollectionOptions } from "./git-process-types/index.js";
export type { GitPipedChild } from "./git-process-types/index.js";
export type { GitSpawn } from "./git-process-types/index.js";
export type { GitSpawnOptions } from "./git-process-types/index.js";
export type { GitVersion } from "./git-process-types/index.js";
export { collectBoundedGitOutput } from "./git-output-collector.js";
export { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";
/** Git global options required for every noninteractive fossil subprocess. */
export declare const SAFE_GIT_BASE_ARGUMENTS: readonly ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="];
/** Keeps caller environment values while overriding Git's interactive process controls. */
export declare function safeGitEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/** Parses the standard Git version evidence needed for a capability decision. */
export declare function parseGitVersion(output: string): GitVersion | undefined;
/** Rejects version evidence that cannot support fossil's history-analysis contract. */
export declare function assertSupportedGitVersion(output: string): GitVersion;
/** Checks Git capability before calling the later history-reading boundary. */
export declare function readHistoryWithSupportedGit<T>(readVersion: () => Promise<string>, readHistory: () => Promise<T>): Promise<T>;
/** Starts repository discovery with the path held as one Git argument rather than shell source. */
export declare function discoverGitRepository(repositoryPath: string, runGit?: GitSpawn, environment?: NodeJS.ProcessEnv): ChildProcess;
/** Runs one noninteractive Git command and retains only bounded collected output. */
export declare function runGitCommand({ arguments_, repositoryPath, input, historyMode }: {
    arguments_: readonly string[];
    repositoryPath?: string;
    input?: string;
    historyMode?: boolean;
}): Promise<CollectedGitOutput>;
