import { BackendCapacityError } from "./backend-capacity-error.js";
import { BackendTimeoutError } from "./backend-timeout-error.js";
import {
  DEFAULT_BACKEND_TIMEOUT_MS,
  MAX_BACKEND_TIMEOUT_MS,
  MAX_PROJECT_BACKEND_REQUESTS,
  MAX_SESSION_BACKEND_REQUESTS,
} from "./backend-timeout-limits.js";

export class BackendRequestLimiter {
  private projectActive = 0;
  private readonly sessionActive = new Map<string, number>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = DEFAULT_BACKEND_TIMEOUT_MS) {
    this.timeoutMs = Math.min(Math.max(timeoutMs, 1), MAX_BACKEND_TIMEOUT_MS);
  }

  async run<T>(
    sessionId: string | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    const sessionActive = this.sessionCount(sessionId);
    this.assertCapacity(sessionActive);
    this.projectActive += 1;
    this.reserveSession(sessionId, sessionActive);
    return this.execute(operation).finally(() => this.release(sessionId));
  }

  private sessionCount(sessionId: string | undefined): number {
    return sessionId ? (this.sessionActive.get(sessionId) ?? 0) : 0;
  }

  private assertCapacity(sessionActive: number): void {
    if (
      this.projectActive >= MAX_PROJECT_BACKEND_REQUESTS ||
      sessionActive >= MAX_SESSION_BACKEND_REQUESTS
    )
      throw new BackendCapacityError();
  }

  private reserveSession(
    sessionId: string | undefined,
    sessionActive: number,
  ): void {
    if (sessionId) this.sessionActive.set(sessionId, sessionActive + 1);
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new BackendTimeoutError()),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private release(sessionId: string | undefined): void {
    this.projectActive -= 1;
    if (!sessionId) return;
    const remaining = (this.sessionActive.get(sessionId) ?? 1) - 1;
    if (remaining === 0) {
      this.sessionActive.delete(sessionId);
      return;
    }
    this.sessionActive.set(sessionId, remaining);
  }
}
