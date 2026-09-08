import { StringDecoder } from "node:string_decoder";
import { GitHistoryStatusCounter } from "./git-process-types/git-history-status-counter.js";
import type { GitIngestionLimits } from "./git-process-types/git-ingestion-limits.js";
import type { GitPipedChild } from "./git-process-types/git-piped-child.js";
export interface CollectorState {
    child: GitPipedChild;
    historyMode: boolean;
    limits: GitIngestionLimits;
    stdoutDecoder: StringDecoder;
    stderrDecoder: StringDecoder;
    statusCounter: GitHistoryStatusCounter;
    stdoutParts: string[];
    stderrParts: string[];
    stdoutBytes: number;
    stderrBytes: number;
    settled: boolean;
}
export declare function createCollectorState(child: GitPipedChild, historyMode: boolean, limits: GitIngestionLimits): CollectorState;
