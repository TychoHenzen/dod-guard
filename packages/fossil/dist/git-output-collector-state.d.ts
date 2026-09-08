import { StringDecoder } from "node:string_decoder";
import { GitHistoryStatusCounter } from "./git-process-types/index.js";
import type { GitIngestionLimits, GitPipedChild } from "./git-process-types/index.js";
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
