import {
  RESTART_DELAYS_MS,
  RESTART_WINDOW_MS,
} from "./direct-lsp-protocol.js";
import type { DirectLspScheduler } from "./direct-lsp-scheduler.js";
import type {
  DirectLspRuntimeTelemetry,
} from "./direct-lsp-runtime-telemetry.js";

export class DirectLspRuntimeRestarts {
  #crashTimes: number[] = [];
  #timeoutTimes: number[] = [];
  #restartTimers = new Set<unknown>();

  constructor(
    private readonly scheduler: DirectLspScheduler,
    private readonly telemetry: DirectLspRuntimeTelemetry,
    private readonly markUnavailable: () => void,
  ) {}

  recordCrash(): number | undefined {
    const now = this.scheduler.now();
    this.#crashTimes = this.#crashTimes.filter(
      (time) => time >= now - RESTART_WINDOW_MS,
    );
    this.#crashTimes.push(now);
    if (this.#crashTimes.length > RESTART_DELAYS_MS.length) {
      this.markUnavailable();
      return undefined;
    }
    const delay = RESTART_DELAYS_MS[this.#crashTimes.length - 1];
    this.telemetry.recordRestartDelay(delay);
    return delay;
  }

  schedule(callback: () => void, delay: number): void {
    const timer = this.scheduler.setTimeout(() => {
      this.#restartTimers.delete(timer);
      callback();
    }, delay);
    this.#restartTimers.add(timer);
  }

  cancel(): void {
    for (const timer of this.#restartTimers)
      this.scheduler.clearTimeout(timer);
    this.#restartTimers.clear();
  }

  recordTimeout(): number {
    const cutoff = this.scheduler.now() - RESTART_WINDOW_MS;
    this.#timeoutTimes = this.#timeoutTimes.filter((time) => time >= cutoff);
    this.#timeoutTimes.push(this.scheduler.now());
    return this.#timeoutTimes.length;
  }

  resetFailureHistory(wasUnavailable: boolean): boolean {
    this.#crashTimes = [];
    this.#timeoutTimes = [];
    return wasUnavailable;
  }
}
