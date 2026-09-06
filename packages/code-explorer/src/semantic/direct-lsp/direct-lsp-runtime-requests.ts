import { DirectLspError } from "./direct-lsp-error.js";
import type { Pending } from "./direct-lsp-pending.js";
import type { DirectLspScheduler } from "./direct-lsp-scheduler.js";

export class DirectLspRuntimeRequests {
  #nextId = 1;
  #pending = new Map<number, Pending>();

  constructor(private readonly scheduler: DirectLspScheduler) {}

  nextId(): number {
    const id = this.#nextId;
    this.#nextId += 1;
    return id;
  }

  setPending(id: number, pending: Pending): void {
    this.#pending.set(id, pending);
  }

  pending(id: number): Pending | undefined {
    return this.#pending.get(id);
  }

  deletePending(id: number): boolean {
    return this.#pending.delete(id);
  }

  rejectInflight(code: DirectLspError["code"]): void {
    for (const entry of this.#pending.values()) {
      this.scheduler.clearTimeout(entry.timer);
      entry.reject(new DirectLspError(code));
    }
    this.#pending.clear();
  }
}
