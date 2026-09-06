import type { LspProcess } from "./direct-lsp-process.js";
import type { DirectLspStatus } from "./direct-lsp-status.js";

export class DirectLspRuntimeLifecycle {
  #process: LspProcess | undefined;
  #epoch = 0;
  #state: DirectLspStatus["state"] = "initializing";
  #stopping = false;
  #stopped = false;
  #exitResolver: (() => void) | undefined;

  get process(): LspProcess | undefined {
    return this.#process;
  }

  get epoch(): number {
    return this.#epoch;
  }

  get state(): DirectLspStatus["state"] {
    return this.#state;
  }

  get stopping(): boolean {
    return this.#stopping;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  beginStart(process: LspProcess): number {
    this.#process = process;
    this.#epoch += 1;
    this.#stopping = false;
    this.#stopped = false;
    this.#state = "initializing";
    return this.#epoch;
  }

  invalidate(rejectInflight: () => void): void {
    this.#epoch += 1;
    this.#stopping = true;
    this.#stopped = true;
    rejectInflight();
  }

  setState(state: DirectLspStatus["state"]): void {
    this.#state = state;
  }

  markStopped(): void {
    this.#stopped = true;
  }

  setStopping(stopping: boolean): void {
    this.#stopping = stopping;
  }

  setExitResolver(resolve: (() => void) | undefined): void {
    this.#exitResolver = resolve;
  }

  resolveExit(): void {
    this.#exitResolver?.();
  }

  clearExitResolver(): void {
    this.#exitResolver = undefined;
  }

  killProcess(): void {
    this.#process?.kill();
  }

  current(epoch: number): boolean {
    return epoch === this.#epoch;
  }
}
