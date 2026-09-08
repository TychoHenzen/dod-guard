import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { FossilAnalysisError } from "./analysis-error.js";
import type { GitPipedChild } from "./git-process.js";

export function pipedChild() {
  const events = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  let killCalls = 0;
  const child: GitPipedChild = {
    stdout: stdout as never,
    stderr: stderr as never,
    once: events.once.bind(events),
    kill: () => {
      killCalls += 1;
      return true;
    },
  };
  return {
    child,
    emitStdout: (text: string) => stdout.emit("data", Buffer.from(text)),
    emitStderr: (text: string) => stderr.emit("data", Buffer.from(text)),
    close: (code: number | null) => events.emit("close", code),
    get killCalls() {
      return killCalls;
    },
  };
}

export function repositoryDiscoveryArguments(repositoryPath: string): readonly string[] {
  return [
    "--no-pager",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "diff.external=",
    "-C",
    repositoryPath,
    "rev-parse",
    "--show-toplevel",
  ];
}

export async function assertResourceLimit(result: Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(
    result,
    (error: unknown) =>
      error instanceof FossilAnalysisError && error.code === "resource_limit" && error.message === message,
  );
}
