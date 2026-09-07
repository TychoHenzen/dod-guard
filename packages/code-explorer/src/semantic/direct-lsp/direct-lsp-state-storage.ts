import type { DirectLspError } from "./direct-lsp-error.js";
import type { Pending } from "./direct-lsp-pending.js";
import { DirectLspRuntimeBuffers } from "./direct-lsp-runtime-buffers.js";
import { DirectLspRuntimeDocuments } from "./direct-lsp-runtime-documents.js";
import { DirectLspRuntimeRequests } from "./direct-lsp-runtime-requests.js";
import type { DirectLspScheduler } from "./direct-lsp-scheduler.js";

export class DirectLspStateStorage {
  #buffers: DirectLspRuntimeBuffers;
  #req: DirectLspRuntimeRequests;
  #docs: DirectLspRuntimeDocuments;

  constructor(scheduler: DirectLspScheduler) {
    this.#buffers = new DirectLspRuntimeBuffers();
    this.#req = new DirectLspRuntimeRequests(scheduler);
    this.#docs = new DirectLspRuntimeDocuments();
  }

  reset(): void {
    this.#buffers.reset();
    this.#docs.reset();
  }

  get serverCapabilities() {
    return this.#docs.serverCapabilities;
  }

  appendBytes(chunk: Uint8Array): void {
    this.#buffers.append(chunk);
  }

  bytesLength() {
    return this.#buffers.length();
  }

  bytesSlice(start?: number, end?: number) {
    return this.#buffers.slice(start, end);
  }

  consumeBytes(end: number): void {
    this.#buffers.consume(end);
  }

  nextRequestId() {
    return this.#req.nextId();
  }

  setPending(id: number, pending: Pending): void {
    this.#req.setPending(id, pending);
  }

  pending(id: number) {
    return this.#req.pending(id);
  }

  deletePending(id: number) {
    return this.#req.deletePending(id);
  }

  rejectInflight(code: DirectLspError["code"]): void {
    this.#req.rejectInflight(code);
  }

  setServerCapabilities(capabilities: Record<string, unknown>): void {
    this.#docs.setServerCapabilities(capabilities);
  }

  hasOpenedDocument(uri: string): boolean {
    return this.#docs.hasOpened(uri);
  }

  markDocumentOpened(uri: string): void {
    this.#docs.markOpened(uri);
  }
}
