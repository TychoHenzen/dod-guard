import type { LanguageAdapter } from "./language-adapter.js";
import type { ProjectRoot } from "./project-root.js";
import type { RootAccessState } from "./root-access-state.js";
import {
  type RootAccessStatus,
  rootAccessStatus,
} from "./root-access-status.js";

/** Gates all navigation behind the frozen-root tuple and bounded recovery. */
export class RootAccessGate {
  private state: RootAccessState = "ready";
  #inaccessibleSince: number | undefined;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly root: ProjectRoot | undefined,
    private readonly adapters: readonly LanguageAdapter[],
    private readonly now: () => number = Date.now,
  ) {}

  async check(): Promise<ReturnType<RootAccessGate["status"]>> {
    if (!this.root) return this.status();
    if (this.state === "project_root_unavailable") return this.status();
    const result = this.root.revalidate();
    if (result === "ready") return this.#handleReady();
    return this.#handleRootFailure(result);
  }

  status(): RootAccessStatus {
    return rootAccessStatus(this.state);
  }

  #handleRootFailure(
    result: ReturnType<NonNullable<ProjectRoot["revalidate"]>>,
  ): Promise<ReturnType<RootAccessGate["status"]>> {
    if (result === "inaccessible" && this.#withinRecoveryWindow())
      return this.#handleTransientInaccessibility();
    return this.#handleUnavailable();
  }
  async #handleReady(): Promise<ReturnType<RootAccessGate["status"]>> {
    if (this.state === "project_root_inaccessible") await this.#restart();
    this.state = "ready";
    this.#inaccessibleSince = undefined;
    this.#clearRetry();
    return this.status();
  }

  async #handleTransientInaccessibility(): Promise<
    ReturnType<RootAccessGate["status"]>
  > {
    this.state = "project_root_inaccessible";
    await this.#stop();
    this.#scheduleRetry();
    return this.status();
  }

  async #handleUnavailable(): Promise<ReturnType<RootAccessGate["status"]>> {
    this.state = "project_root_unavailable";
    this.#clearRetry();
    await this.#stop();
    return this.status();
  }

  #withinRecoveryWindow(): boolean {
    this.#inaccessibleSince ??= this.now();
    return this.now() - this.#inaccessibleSince < 30_000;
  }

  async #stop(): Promise<void> {
    await Promise.all(
      this.adapters.flatMap((adapter) =>
        adapter.shutdown ? [adapter.shutdown()] : [],
      ),
    );
  }

  async #restart(): Promise<void> {
    await Promise.all(
      this.adapters.flatMap((adapter) =>
        adapter.start ? [adapter.start()] : [],
      ),
    );
  }

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
