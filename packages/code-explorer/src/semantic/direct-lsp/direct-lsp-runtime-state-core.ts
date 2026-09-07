import type { LspProcess } from "./direct-lsp-process.js";
import { encodeMessage } from "./direct-lsp-protocol.js";
import { DirectLspRuntimeLifecycle } from "./direct-lsp-runtime-lifecycle.js";
import { defaultDirectLspScheduler } from "./direct-lsp-runtime-scheduler.js";
import { DirectLspStateResources } from "./direct-lsp-state-resources.js";
import type { DirectLspStatus } from "./direct-lsp-status.js";

export class DirectLspRuntimeStateCore extends DirectLspStateResources {
  readonly scheduler: typeof defaultDirectLspScheduler;
  #life: DirectLspRuntimeLifecycle;

  constructor(scheduler: typeof defaultDirectLspScheduler) {
    super(scheduler);
    this.scheduler = scheduler;
    this.#life = new DirectLspRuntimeLifecycle();
  }

  protected onUnavailable(): void {
    this.#life.setState("unavailable");
  }

  get process() {
    return this.#life.process;
  }

  get epoch() {
    return this.#life.epoch;
  }

  get state() {
    return this.#life.state;
  }

  get stopping() {
    return this.#life.stopping;
  }

  get stopped() {
    return this.#life.stopped;
  }

  beginStart(process: LspProcess) {
    const epoch = this.#life.beginStart(process);
    this.reset();
    return epoch;
  }

  invalidate() {
    this.#life.invalidate(() => this.rejectInflight("backend_crashed"));
  }

  setState(state: DirectLspStatus["state"]) {
    this.#life.setState(state);
  }

  markStopped() {
    this.#life.markStopped();
  }

  setStopping(stopping: boolean) {
    this.#life.setStopping(stopping);
  }

  setExitResolver(resolve?: () => void) {
    this.#life.setExitResolver(resolve);
  }

  resolveExit() {
    this.#life.resolveExit();
  }

  clearExitResolver() {
    this.#life.clearExitResolver();
  }

  killProcess() {
    this.#life.killProcess();
  }

  resetFailureHistory() {
    if (super.resetFailureHistoryState(this.state === "unavailable"))
      this.setState("initializing");
  }

  current(epoch: number) {
    return this.#life.current(epoch);
  }

  send(message: Record<string, unknown>, expectedEpoch = this.epoch) {
    if (this.current(expectedEpoch))
      this.process?.write(encodeMessage(message));
  }
}
