import { FossilAnalysisError } from "./analysis-error.js";
import type { CollectedGitOutput } from "./git-process-types/index.js";
import type { CollectorState } from "./git-output-collector-state.js";

function rejectLimit(
  state: CollectorState,
  rejectPromise: (reason?: unknown) => void,
  message: string,
): void {
  if (state.settled) return;
  state.settled = true;
  try {
    state.child.kill();
  } finally {
    rejectPromise(new FossilAnalysisError({ code: "resource_limit", message }));
  }
}

export function collectStdoutChunk(
  state: CollectorState,
  rejectPromise: (reason?: unknown) => void,
  chunk: Buffer,
): void {
  if (state.settled) return;
  state.stdoutBytes += chunk.byteLength;
  if (state.stdoutBytes > state.limits.maximumStdoutBytes) {
    rejectLimit(state, rejectPromise, "Git stdout limit exceeded.");
    return;
  }
  const text = state.stdoutDecoder.write(chunk);
  state.stdoutParts.push(text);
  if (
    state.historyMode &&
    state.statusCounter.add(text) > state.limits.maximumStatusRecords
  )
    rejectLimit(state, rejectPromise, "Git status record limit exceeded.");
}

export function collectStderrChunk(
  state: CollectorState,
  rejectPromise: (reason?: unknown) => void,
  chunk: Buffer,
): void {
  if (state.settled) return;
  state.stderrBytes += chunk.byteLength;
  if (state.stderrBytes > state.limits.maximumStderrBytes) {
    rejectLimit(state, rejectPromise, "Git stderr limit exceeded.");
    return;
  }
  state.stderrParts.push(state.stderrDecoder.write(chunk));
}

export function rejectError(
  state: CollectorState,
  rejectPromise: (reason?: unknown) => void,
  error: Error,
): void {
  if (state.settled) return;
  state.settled = true;
  rejectPromise(error);
}

export function finishCollection(
  state: CollectorState,
  resolvePromise: (value: CollectedGitOutput) => void,
  rejectPromise: (reason?: unknown) => void,
  exitCode: number | null,
): void {
  if (state.settled) return;
  const finalStdout = state.stdoutDecoder.end();
  const finalStderr = state.stderrDecoder.end();
  state.stdoutParts.push(finalStdout);
  state.stderrParts.push(finalStderr);
  if (
    state.historyMode &&
    state.statusCounter.add(finalStdout) > state.limits.maximumStatusRecords
  ) {
    rejectLimit(state, rejectPromise, "Git status record limit exceeded.");
    return;
  }
  state.settled = true;
  resolvePromise({
    exitCode,
    stdout: state.stdoutParts.join(""),
    stderr: state.stderrParts.join(""),
    stdoutBytes: state.stdoutBytes,
    stderrBytes: state.stderrBytes,
    statusRecordCount: state.statusCounter.count,
  });
}
