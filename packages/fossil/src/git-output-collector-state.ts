import { StringDecoder } from "node:string_decoder";
import {
  GitHistoryStatusCounter,
} from "./git-process-types/git-history-status-counter.js";
import type {
  GitIngestionLimits,
} from "./git-process-types/git-ingestion-limits.js";
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

export function createCollectorState(
  child: GitPipedChild,
  historyMode: boolean,
  limits: GitIngestionLimits,
): CollectorState {
  return {
    child,
    historyMode,
    limits,
    stdoutDecoder: new StringDecoder(),
    stderrDecoder: new StringDecoder(),
    statusCounter: new GitHistoryStatusCounter(),
    stdoutParts: [],
    stderrParts: [],
    stdoutBytes: 0,
    stderrBytes: 0,
    settled: false,
  };
}
