import { type ChildProcess } from "node:child_process";
export interface GitSpawnOptions {
    readonly shell: false;
    readonly windowsHide: true;
    readonly env: NodeJS.ProcessEnv;
}
export type GitSpawn = (command: string, arguments_: readonly string[], options: GitSpawnOptions) => ChildProcess;
export interface GitVersion {
    readonly major: number;
    readonly minor: number;
}
export interface GitIngestionLimits {
    readonly maximumStdoutBytes: number;
    readonly maximumStderrBytes: number;
    readonly maximumStatusRecords: number;
}
export interface GitPipedChild {
    readonly stdout: {
        on(event: "data", listener: (chunk: Buffer) => void): unknown;
    } | null;
    readonly stderr: {
        on(event: "data", listener: (chunk: Buffer) => void): unknown;
    } | null;
    once(event: "close", listener: (code: number | null) => void): unknown;
    once(event: "error", listener: (error: Error) => void): unknown;
    kill(): boolean;
}
export interface CollectedGitOutput {
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly stdoutBytes: number;
    readonly stderrBytes: number;
    readonly statusRecordCount: number;
}
export interface GitOutputCollectionOptions {
    readonly historyMode?: boolean;
    readonly limits?: Partial<GitIngestionLimits>;
}
export declare const DEFAULT_GIT_INGESTION_LIMITS: GitIngestionLimits;
/** Git global options required for every noninteractive fossil subprocess. */
export declare const SAFE_GIT_BASE_ARGUMENTS: readonly ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.external="];
/** Keeps caller environment values while overriding Git's interactive process controls. */
export declare function safeGitEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/** Collects piped Git output within bounded byte and history-status record limits. */
export declare function collectBoundedGitOutput(child: GitPipedChild, { historyMode, limits: suppliedLimits }?: GitOutputCollectionOptions): Promise<CollectedGitOutput>;
/** Parses the standard Git version evidence needed for a capability decision. */
export declare function parseGitVersion(output: string): GitVersion | undefined;
/** Rejects version evidence that cannot support fossil's history-analysis contract. */
export declare function assertSupportedGitVersion(output: string): GitVersion;
/** Checks Git capability before calling the later history-reading boundary. */
export declare function readHistoryWithSupportedGit<T>(readVersion: () => Promise<string>, readHistory: () => Promise<T>): Promise<T>;
/** Starts repository discovery with the path held as one Git argument rather than shell source. */
export declare function discoverGitRepository(repositoryPath: string, runGit?: GitSpawn, environment?: NodeJS.ProcessEnv): ChildProcess;
/** Runs one noninteractive Git command and retains only bounded collected output. */
export declare function runGitCommand(arguments_: readonly string[], repositoryPath?: string, input?: string, historyMode?: boolean): Promise<CollectedGitOutput>;
