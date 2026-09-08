import { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";
import type {
  CollectedGitOutput,
  GitOutputCollectionOptions,
  GitPipedChild,
} from "./git-process-types/index.js";
import {
  collectStderrChunk,
  collectStdoutChunk,
  finishCollection,
  rejectError,
} from "./git-output-collector-handlers.js";
import { createCollectorState } from "./git-output-collector-state.js";

/** Collects piped Git output within bounded byte and status-record limits. */
export function collectBoundedGitOutput(
  child: GitPipedChild,
  {
    historyMode = false,
    limits: suppliedLimits = {},
  }: GitOutputCollectionOptions = {},
): Promise<CollectedGitOutput> {
  const limits = { ...DEFAULT_GIT_INGESTION_LIMITS, ...suppliedLimits };
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!(stdout && stderr))
    return Promise.reject(
      new Error("Git child must use piped stdout and stderr."),
    );
  return new Promise((resolvePromise, rejectPromise) => {
    const state = createCollectorState(child, historyMode, limits);
    stdout.on("data", (chunk) =>
      collectStdoutChunk(state, rejectPromise, chunk),
    );
    stderr.on("data", (chunk) =>
      collectStderrChunk(state, rejectPromise, chunk),
    );
    child.once("error", (error) => rejectError(state, rejectPromise, error));
    child.once("close", (exitCode) =>
      finishCollection(state, resolvePromise, rejectPromise, exitCode),
    );
  });
}
