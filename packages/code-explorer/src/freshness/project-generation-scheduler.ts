import type { FreshnessStatus, WorkspaceFreshness } from "./workspace-freshness.js";

export type AcceptedGeneration = { accepted_request: number; status: FreshnessStatus };

/** Serializes project-wide generation decisions without holding the queue during ordinary semantic work. */
export class ProjectGenerationScheduler {
  #tail: Promise<void> = Promise.resolve();
  #acceptedRequests = 0;
  #refresh: Promise<FreshnessStatus> | undefined;

  constructor(private readonly freshness: WorkspaceFreshness) {}

  accept(): Promise<AcceptedGeneration> {
    return this.#enqueue(() => ({ accepted_request: ++this.#acceptedRequests, status: this.freshness.status() }));
  }

  refresh(work: () => Promise<void>): Promise<FreshnessStatus> {
    if (this.#refresh) return this.#refresh;
    const refresh = this.#enqueue(async () => {
      ++this.#acceptedRequests;
      this.freshness.reserveRefresh();
      try {
        await work();
        await this.freshness.reconcile();
      } catch {
        this.freshness.failRefresh();
      }
      return this.freshness.status();
    });
    this.#refresh = refresh;
    void refresh.then(
      () => {
        if (this.#refresh === refresh) this.#refresh = undefined;
      },
      () => {
        if (this.#refresh === refresh) this.#refresh = undefined;
      },
    );
    return refresh;
  }

  #enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const response = this.#tail.then(operation);
    this.#tail = response.then(
      () => undefined,
      () => undefined,
    );
    return response;
  }
}
