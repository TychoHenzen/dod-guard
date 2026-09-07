import type { FocusView } from "./focus-view-type.js";
import type { RetainedRequest } from "./retained-request.js";

export type Session = {
  connectionId: string;
  queue: Promise<void>;
  requests: Map<string, RetainedRequest<unknown>>;
  views: Map<string, FocusView>;
  viewHistory: string[];
  historyPosition: number;
  staleViews: Set<string>;
  lastAcceptedAt: number;
  queuedRequests: number;
};
