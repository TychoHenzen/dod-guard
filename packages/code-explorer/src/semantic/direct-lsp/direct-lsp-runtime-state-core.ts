import type { DirectLspError } from "./direct-lsp-error.js";
import type { Pending } from "./direct-lsp-pending.js";
import type { LspProcess } from "./direct-lsp-process.js";
import { encodeMessage } from "./direct-lsp-protocol.js";
import { DirectLspRuntimeBuffers } from "./direct-lsp-runtime-buffers.js";
import { DirectLspRuntimeDocuments } from "./direct-lsp-runtime-documents.js";
import { DirectLspRuntimeLifecycle } from "./direct-lsp-runtime-lifecycle.js";
import { DirectLspRuntimeRequests } from "./direct-lsp-runtime-requests.js";
import { DirectLspRuntimeRestarts } from "./direct-lsp-runtime-restarts.js";
import { defaultDirectLspScheduler } from "./direct-lsp-runtime-scheduler.js";
import { DirectLspRuntimeTelemetry } from "./direct-lsp-runtime-telemetry.js";
import type { DirectLspStatus } from "./direct-lsp-status.js";

export class DirectLspRuntimeStateCore {
  readonly scheduler: typeof defaultDirectLspScheduler;
  #life: DirectLspRuntimeLifecycle;
  #buffers: DirectLspRuntimeBuffers;
  #req: DirectLspRuntimeRequests;
  #telemetry: DirectLspRuntimeTelemetry;
  #restarts: DirectLspRuntimeRestarts;
  #docs: DirectLspRuntimeDocuments;

  constructor(scheduler: typeof defaultDirectLspScheduler) {
    this.scheduler = scheduler;
    this.#life = new DirectLspRuntimeLifecycle();
    this.#buffers = new DirectLspRuntimeBuffers();
    this.#req = new DirectLspRuntimeRequests(scheduler);
    this.#telemetry = new DirectLspRuntimeTelemetry();
    this.#restarts = new DirectLspRuntimeRestarts(
      scheduler,
      this.#telemetry,
      () => this.#life.setState("unavailable"),
    );
    this.#docs = new DirectLspRuntimeDocuments();
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
  get serverCapabilities() {
    return this.#docs.serverCapabilities;
  }
  beginStart(process: LspProcess) {
    const epoch = this.#life.beginStart(process);
    this.#buffers.reset();
    this.#docs.reset();
    return epoch;
  }
  invalidate() {
    this.#life.invalidate(() => this.#req.rejectInflight("backend_crashed"));
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
  appendBytes(chunk: Uint8Array) {
    this.#buffers.append(chunk);
  }
  bytesLength() {
    return this.#buffers.length();
  }
  bytesSlice(start?: number, end?: number) {
    return this.#buffers.slice(start, end);
  }
  consumeBytes(end: number) {
    this.#buffers.consume(end);
  }
  nextRequestId() {
    return this.#req.nextId();
  }
  setPending(id: number, pending: Pending) {
    this.#req.setPending(id, pending);
  }
  pending(id: number) {
    return this.#req.pending(id);
  }
  deletePending(id: number) {
    return this.#req.deletePending(id);
  }
  rejectInflight(code: DirectLspError["code"]) {
    this.#req.rejectInflight(code);
  }
  recordEvent(event: DirectLspStatus["events"][number]) {
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
  scheduleRestart(callback: () => void, delay: number) {
    this.#restarts.schedule(callback, delay);
  }
  cancelRestarts() {
    this.#restarts.cancel();
  }
  recordTimeout() {
    return this.#restarts.recordTimeout();
  }
  resetFailureHistory() {
    if (this.#restarts.resetFailureHistory(this.state === "unavailable"))
      this.setState("initializing");
  }
  setServerCapabilities(capabilities: Record<string, unknown>) {
    this.#docs.setServerCapabilities(capabilities);
  }
  hasOpenedDocument(uri: string) {
    return this.#docs.hasOpened(uri);
  }
  markDocumentOpened(uri: string) {
    this.#docs.markOpened(uri);
  }
  current(epoch: number) {
    return this.#life.current(epoch);
  }
  send(message: Record<string, unknown>, expectedEpoch = this.epoch) {
    if (this.current(expectedEpoch))
      this.process?.write(encodeMessage(message));
  }
}
