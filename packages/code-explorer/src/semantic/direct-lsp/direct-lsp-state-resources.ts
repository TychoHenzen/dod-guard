import { DirectLspRuntimeRestarts } from "./direct-lsp-runtime-restarts.js";
import type { DirectLspScheduler } from "./direct-lsp-scheduler.js";
import { DirectLspStateStorage } from "./direct-lsp-state-storage.js";
import type { DirectLspStatus } from "./direct-lsp-status.js";
import { DirectLspRuntimeTelemetry } from "./telemetry.js";

export abstract class DirectLspStateResources extends DirectLspStateStorage {
  #telemetry: DirectLspRuntimeTelemetry;
  #restarts: DirectLspRuntimeRestarts;

  constructor(scheduler: DirectLspScheduler) {
    super(scheduler);
    this.#telemetry = new DirectLspRuntimeTelemetry();
    this.#restarts = new DirectLspRuntimeRestarts(
      scheduler,
      this.#telemetry,
      () => this.onUnavailable(),
    );
  }

  protected abstract onUnavailable(): void;

  recordEvent(event: DirectLspStatus["events"][number]): void {
    this.#telemetry.recordEvent(event);
  }

  eventsSnapshot() {
    return this.#telemetry.eventsSnapshot();
  }

  restartDelaysSnapshot() {
    return this.#telemetry.restartDelaysSnapshot();
  }

  recordCrash() {
    return this.#restarts.recordCrash();
  }

  scheduleRestart(callback: () => void, delay: number): void {
    this.#restarts.schedule(callback, delay);
  }

  cancelRestarts(): void {
    this.#restarts.cancel();
  }

  recordTimeout() {
    return this.#restarts.recordTimeout();
  }

  resetFailureHistoryState(wasUnavailable: boolean): boolean {
    return this.#restarts.resetFailureHistory(wasUnavailable);
  }
}
