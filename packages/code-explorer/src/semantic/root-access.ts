import type { LanguageAdapter } from "./language-adapter.js";
import type { ProjectRoot } from "./project-root.js";

export type RootAccessState = "ready" | "project_root_inaccessible" | "project_root_unavailable";

export type RootAccessStatus = { state: RootAccessState; restart_required: boolean };

/** Gates all navigation behind the frozen-root tuple and bounded transient recovery. */
export class RootAccessGate {
  #state: RootAccessState = "ready";
  #inaccessibleSince: number | undefined;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly root: ProjectRoot | undefined,
    private readonly adapters: readonly LanguageAdapter[],
    private readonly now: () => number = Date.now,
  ) {}

  async check(): Promise<RootAccessStatus> {
    if (!this.root) return this.status();
    if (this.#state === "project_root_unavailable") return this.status();
    const result = this.root.revalidate();
    if (result === "ready") {
      if (this.#state === "project_root_inaccessible") await this.#restart();
      this.#state = "ready";
      this.#inaccessibleSince = undefined;
      this.#clearRetry();
      return this.status();
    }
    if (result === "inaccessible") {
      this.#inaccessibleSince ??= this.now();
      if (this.now() - this.#inaccessibleSince < 30_000) {
        this.#state = "project_root_inaccessible";
        await this.#stop();
        this.#scheduleRetry();
        return this.status();
      }
    }
    this.#state = "project_root_unavailable";
    this.#clearRetry();
    await this.#stop();
    return this.status();
  }

  status(): RootAccessStatus {
    return { state: this.#state, restart_required: this.#state === "project_root_unavailable" };
  }

  async #stop(): Promise<void> { await Promise.all(this.adapters.flatMap((adapter) => adapter.shutdown ? [adapter.shutdown()] : [])); }
  async #restart(): Promise<void> { await Promise.all(this.adapters.flatMap((adapter) => adapter.start ? [adapter.start()] : [])); }
  #scheduleRetry(): void {
    if (this.#retryTimer !== undefined) return;
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined;
      void this.check();
    }, 5_000);
    this.#retryTimer.unref?.();
  }
  #clearRetry(): void {
    if (this.#retryTimer === undefined) return;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
  }
}
