import { StringDecoder } from "node:string_decoder";
import { FossilAnalysisError } from "./analysis-error.js";
import { GitHistoryStatusCounter } from "./git-process-types/git-history-status-counter.js";
import { DEFAULT_GIT_INGESTION_LIMITS } from "./git-process-limits.js";
import type { CollectedGitOutput } from "./git-process-types/collected-git-output.js";
import type { GitOutputCollectionOptions } from "./git-process-types/git-output-collection-options.js";
import type { GitPipedChild } from "./git-process-types/git-piped-child.js";

/** Collects piped Git output within bounded byte and history-status record limits. */
export function collectBoundedGitOutput(
  child: GitPipedChild,
  { historyMode = false, limits: suppliedLimits = {} }: GitOutputCollectionOptions = {},
): Promise<CollectedGitOutput> {
  const limits = { ...DEFAULT_GIT_INGESTION_LIMITS, ...suppliedLimits };
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!(stdout && stderr)) return Promise.reject(new Error("Git child must use piped stdout and stderr."));
  return new Promise((resolvePromise, rejectPromise) => {
    const stdoutDecoder = new StringDecoder();
    const stderrDecoder = new StringDecoder();
    const statusCounter = new GitHistoryStatusCounter();
    const stdoutParts: string[] = [];
    const stderrParts: string[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const rejectLimit = (message: string) => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } finally {
        rejectPromise(new FossilAnalysisError({ code: "resource_limit", message }));
      }
    };

    stdout.on("data", (chunk) => {
      if (settled) return;
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > limits.maximumStdoutBytes) {
        rejectLimit("Git stdout limit exceeded.");
        return;
      }
      const text = stdoutDecoder.write(chunk);
      stdoutParts.push(text);
      if (historyMode && statusCounter.add(text) > limits.maximumStatusRecords)
        rejectLimit("Git status record limit exceeded.");
    });
    stderr.on("data", (chunk) => {
      if (settled) return;
      stderrBytes += chunk.byteLength;
      if (stderrBytes > limits.maximumStderrBytes) {
        rejectLimit("Git stderr limit exceeded.");
        return;
      }
      stderrParts.push(stderrDecoder.write(chunk));
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;
      const finalStdout = stdoutDecoder.end();
      const finalStderr = stderrDecoder.end();
      stdoutParts.push(finalStdout);
      stderrParts.push(finalStderr);
      if (historyMode && statusCounter.add(finalStdout) > limits.maximumStatusRecords) {
        rejectLimit("Git status record limit exceeded.");
        return;
      }
      settled = true;
      resolvePromise({
        exitCode,
        stdout: stdoutParts.join(""),
        stderr: stderrParts.join(""),
        stdoutBytes,
        stderrBytes,
        statusRecordCount: statusCounter.count,
      });
    });
  });
}
