import type { SessionResult } from "./session-result.js";
import {
  executeSession,
  resolveHandle,
  type SessionRuntime,
} from "./session-operations.js";

export type SessionManagerArguments<T> = {
  execute: [
    connectionId: string,
    sessionId: string,
    requestId: string,
    toolName: string,
    arguments_: Record<string, unknown>,
    operation: () => Promise<T>,
    now?: number,
  ];
  resolve: [
    connectionId: string,
    sessionId: string,
    viewId: string,
    handle: string,
    currentGeneration?: number,
  ];
};

export function executeManagerRequest<T>(
  runtime: SessionRuntime,
  args: SessionManagerArguments<T>["execute"],
): SessionResult<T> {
  const now = args[6] ?? Date.now();
  return executeSession(runtime, {
    connectionId: args[0],
    sessionId: args[1],
    requestId: args[2],
    toolName: args[3],
    arguments_: args[4],
    operation: args[5],
    now,
  });
}

export function resolveManagerHandle(
  runtime: SessionRuntime,
  args: SessionManagerArguments<unknown>["resolve"],
) {
  const [connectionId, sessionId, viewId, handle, currentGeneration = 0] = args;
  return resolveHandle(runtime, {
    connectionId,
    sessionId,
    viewId,
    handle,
    currentGeneration,
  });
}
