import type { InjectedSemanticBackend } from "../adapters/language-adapter.js";
import { relationCapabilitiesFromInitialize } from "../direct-lsp/semantic.js";
import type { RuntimeLspBackendOptions } from "./runtime-lsp-options.js";
import { createRuntimeStart } from "./runtime-lsp-start.js";
import type { RuntimeLspState } from "./runtime-lsp-state.js";

export type { RuntimeLspBackendOptions } from "./runtime-lsp-options.js";

export function createRuntimeLspBackend(
  options: RuntimeLspBackendOptions,
): InjectedSemanticBackend {
  const lifecycle: RuntimeLspState = {
    options,
    state: { state: "initializing" },
    inner: undefined,
    client: undefined,
    started: undefined,
    disposed: false,
    refreshRequired: false,
  };
  const start = createRuntimeStart(lifecycle);
  return {
    readiness: () => runtimeReadiness(lifecycle),
    start,
    refresh: () => refreshRuntime(lifecycle, start),
    capabilities: () => runtimeCapabilities(lifecycle, options),
    shutdown: () => shutdownRuntime(lifecycle),
    query: (request) => queryRuntime(lifecycle, start, request),
  };
}

function runtimeReadiness(lifecycle: RuntimeLspState) {
  return lifecycle.inner?.readiness() ?? lifecycle.state;
}

function runtimeCapabilities(
  lifecycle: RuntimeLspState,
  options: RuntimeLspBackendOptions,
) {
  if (lifecycle.inner?.capabilities) return lifecycle.inner.capabilities();
  if (lifecycle.client)
    return relationCapabilitiesFromInitialize(lifecycle.client.status());
  return options.capabilities;
}

async function refreshRuntime(
  lifecycle: RuntimeLspState,
  start: () => Promise<void>,
): Promise<void> {
  if (lifecycle.disposed || !lifecycle.refreshRequired) return;
  lifecycle.refreshRequired = false;
  lifecycle.started = undefined;
  lifecycle.inner = undefined;
  lifecycle.client = undefined;
  lifecycle.state = { state: "refreshing" };
  await start();
}

async function shutdownRuntime(lifecycle: RuntimeLspState): Promise<void> {
  if (lifecycle.disposed) return;
  lifecycle.disposed = true;
  try {
    await lifecycle.client?.shutdown?.();
  } finally {
    lifecycle.options.dispose?.();
  }
}

async function queryRuntime(
  lifecycle: RuntimeLspState,
  start: () => Promise<void>,
  request: Parameters<InjectedSemanticBackend["query"]>[0],
) {
  await start();
  if (!lifecycle.inner) throw new Error("backend_unavailable");
  return lifecycle.inner.query(request);
}
