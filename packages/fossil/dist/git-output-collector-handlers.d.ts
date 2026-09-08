import type { CollectedGitOutput } from "./git-process-types/collected-git-output.js";
import type { CollectorState } from "./git-output-collector-state.js";
export declare function collectStdoutChunk(state: CollectorState, rejectPromise: (reason?: unknown) => void, chunk: Buffer): void;
export declare function collectStderrChunk(state: CollectorState, rejectPromise: (reason?: unknown) => void, chunk: Buffer): void;
export declare function rejectError(state: CollectorState, rejectPromise: (reason?: unknown) => void, error: Error): void;
export declare function finishCollection(state: CollectorState, resolvePromise: (value: CollectedGitOutput) => void, rejectPromise: (reason?: unknown) => void, exitCode: number | null): void;
