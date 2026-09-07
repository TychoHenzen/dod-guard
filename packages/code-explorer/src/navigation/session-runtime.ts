import type { Session } from "./session-state.js";

export type SessionRuntime = {
  sessions: Map<string, Session>;
  maxRetainedBodyBytes: number;
  retainedBodyBytes: number;
  queuedRequests: number;
};
