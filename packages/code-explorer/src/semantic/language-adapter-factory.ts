import {
  type Language,
  parseSemanticRequest,
  parseSemanticResult,
} from "./contract.js";
import type { LanguageAdapterOptions } from "./language-adapter-options.js";
import { configuredCapabilities } from "./language-adapter-status.js";
import { createStatusReader } from "./language-adapter-status-reader.js";
import type { LanguageAdapter } from "./language-adapter-type.js";

export function createLanguageAdapter(
  language: Language,
  options: LanguageAdapterOptions,
): LanguageAdapter {
  const backend = options.backend;
  const lifecycle = lifecycleMethods(backend);
  const capabilities = configuredCapabilities(options.capabilities);
  const now = options.now ?? Date.now;
  return {
    status: createStatusReader({
      language,
      options,
      capabilities: () => backend.capabilities?.() ?? capabilities,
      now,
    }),
    request: (request) =>
      Promise.resolve().then(() => requestBackend(backend, request)),
    ...lifecycle,
  };
}

function requestBackend(
  backend: LanguageAdapterOptions["backend"],
  request: Parameters<LanguageAdapterOptions["backend"]["query"]>[0],
): Promise<
  ReturnType<LanguageAdapterOptions["backend"]["query"]> extends Promise<
    infer Result
  >
    ? Result
    : never
> {
  return backend.query(parseSemanticRequest(request)).then(parseSemanticResult);
}

function lifecycleMethods(
  backend: LanguageAdapterOptions["backend"],
): Pick<LanguageAdapter, "start" | "shutdown" | "refresh"> {
  return {
    ...(backend.start ? { start: backend.start } : {}),
    ...(backend.shutdown ? { shutdown: backend.shutdown } : {}),
    ...(backend.refresh ? { refresh: backend.refresh } : {}),
  };
}
