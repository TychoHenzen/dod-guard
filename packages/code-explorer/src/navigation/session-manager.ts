import type { AddViewResult } from "./add-view-result.js";
import type { FocusView } from "./focus-view-type.js";
import { SessionCapacityError } from "./session-capacity-error.js";
import {
  MAX_RETAINED_VIEW_BODY_BYTES,
  MAX_RETAINED_VIEWS,
} from "./session-limits.js";
import {
  executeManagerRequest,
  resolveManagerHandle,
  type SessionManagerArguments,
} from "./session-manager-arguments.js";
import {
  addView,
  closeConnection,
  history,
  historyPosition,
  newSessionRuntime,
  recent,
  restore,
  type SessionRuntime,
  tryStart,
} from "./session-operations.js";
import type { SessionResult } from "./session-result.js";

export class SessionManager {
  private readonly runtime: SessionRuntime;
  constructor(options: { maxRetainedBodyBytes?: number } = {}) {
    this.runtime = newSessionRuntime(
      options.maxRetainedBodyBytes ?? MAX_RETAINED_VIEW_BODY_BYTES,
    );
  }

  start(connectionId: string): string {
    const sessionId = this.tryStart(connectionId);
    if (!sessionId) throw new SessionCapacityError();
    return sessionId;
  }

  tryStart(connectionId: string, now = Date.now()): string | undefined {
    return tryStart(this.runtime, connectionId, now);
  }

  closeConnection(connectionId: string): void {
    closeConnection(this.runtime, connectionId);
  }
  execute<T>(...args: SessionManagerArguments<T>["execute"]): SessionResult<T> {
    return executeManagerRequest(this.runtime, args);
  }

  addView(
    connectionId: string,
    sessionId: string,
    view: FocusView,
  ): AddViewResult {
    return addView({ runtime: this.runtime, connectionId, sessionId, view });
  }
  resolveHandle(...args: SessionManagerArguments<unknown>["resolve"]) {
    return resolveManagerHandle(this.runtime, args);
  }

  history(
    connectionId: string,
    sessionId: string,
  ): readonly string[] | undefined {
    return history(this.runtime, connectionId, sessionId);
  }

  restore(
    connectionId: string,
    sessionId: string,
    direction: "back" | "forward",
  ): FocusView | undefined {
    return restore({
      runtime: this.runtime,
      connectionId,
      sessionId,
      direction,
    });
  }

  recent(
    connectionId: string,
    sessionId: string,
    limit = MAX_RETAINED_VIEWS,
  ): readonly FocusView[] | undefined {
    return recent({ runtime: this.runtime, connectionId, sessionId, limit });
  }

  historyPosition(connectionId: string, sessionId: string): number | undefined {
    return historyPosition(this.runtime, connectionId, sessionId);
  }
}
