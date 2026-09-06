import type { DirectLspStatus } from "./direct-lsp-status.js";

const MAX_RUNTIME_EVENTS = 256;

export class DirectLspRuntimeTelemetry {
  #events: DirectLspStatus["events"][number][] = [];
  #restartDelays: number[] = [];

  recordEvent(event: DirectLspStatus["events"][number]): void {
    if (this.#events.length === MAX_RUNTIME_EVENTS) this.#events.shift();
    this.#events.push(event);
  }

  eventsSnapshot(): readonly DirectLspStatus["events"][number][] {
    return [...this.#events];
  }

  recordRestartDelay(delay: number): void {
    this.#restartDelays.push(delay);
  }

  restartDelaysSnapshot(): readonly number[] {
    return [...this.#restartDelays];
  }
}
