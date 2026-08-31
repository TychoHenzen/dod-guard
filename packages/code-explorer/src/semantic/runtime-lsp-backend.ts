import type { BackendLaunchFailure } from "./backend-launch-policy.js";
import type { SymbolIdentity } from "./contract.js";
import { createDirectLspClient, type DirectLspScheduler, type LspProcess } from "./direct-lsp.js";
import {
  createDirectLspSemanticBackend,
  type DirectLspSemanticOptions,
  relationCapabilitiesFromInitialize,
} from "./direct-lsp-semantic.js";
import type { InjectedSemanticBackend } from "./language-adapter.js";
import { spawnNativeLspProcess } from "./native-lsp-process.js";

export type RuntimeLspBackendOptions = Omit<DirectLspSemanticOptions, "client"> & {
  root_uri: string;
  initial_document_paths?: readonly string[];
  safe_initialization_options: Record<string, unknown>;
  prepare():
    | {
        status: "ready";
        executable: string;
        arguments: readonly string[];
        environment: Readonly<Record<string, string>>;
      }
    | { status: "unavailable"; code: BackendLaunchFailure };
  confirmInitialized(): { status: "ready" } | { status: "unavailable"; code: BackendLaunchFailure; terminate: true };
  dispose?(): void;
  spawn?(executable: string, arguments_: readonly string[], environment: Readonly<Record<string, string>>): LspProcess;
  scheduler?: DirectLspScheduler;
};

/** Starts an approved native process immediately before initialize and rechecks it after initialize. */
export function createRuntimeLspBackend(options: RuntimeLspBackendOptions): InjectedSemanticBackend {
  let state: ReturnType<InjectedSemanticBackend["readiness"]> = { state: "initializing" };
  let inner: InjectedSemanticBackend | undefined;
  let client: ReturnType<typeof createDirectLspClient> | undefined;
  let started: Promise<void> | undefined;
  let disposed = false;
  let refreshRequired = false;
  const start = async () => {
    if (refreshRequired) throw new Error("backend_identity_changed");
    if (started) return started;
    started = (async () => {
      const preparation = options.prepare();
      if (preparation.status !== "ready") {
        state = { state: "unavailable", failure_code: preparation.code };
        throw new Error(preparation.code);
      }
      client = createDirectLspClient({
        language: options.language,
        root_uri: options.root_uri,
        capabilities: {},
        safe_initialization_options: options.safe_initialization_options,
        scheduler: options.scheduler,
        afterInitialize: () => options.confirmInitialized(),
        restart: () => {
          const next = options.prepare();
          if (next.status !== "ready") return undefined;
          return (options.spawn ?? spawnNativeLspProcess)(next.executable, next.arguments, next.environment);
        },
      });
      const process = (options.spawn ?? spawnNativeLspProcess)(
        preparation.executable,
        preparation.arguments,
        preparation.environment,
      );
      await client.start(process);
      for (const path of options.initial_document_paths ?? []) {
        const document = options.root.protectedRead(path);
        client.openProtectedDocument?.(options.toBackendUri(initialDocumentLocation(path)), {
          language_id: options.language,
          bytes: document.bytes,
        });
      }
      inner = createDirectLspSemanticBackend({
        ...options,
        client,
        discovery_document_paths: options.initial_document_paths,
      });
      state = readiness(client.status().state);
    })().catch((error) => {
      const code = error instanceof Error ? error.message : "backend_failed";
      state =
        code === "backend_identity_changed"
          ? { state: "unavailable", failure_code: code }
          : { state: "failed", failure_code: code };
      refreshRequired ||= code === "backend_identity_changed";
      throw error;
    });
    return started;
  };
  return {
    readiness: () => inner?.readiness() ?? state,
    start,
    refresh: async () => {
      if (!refreshRequired) return;
      refreshRequired = false;
      started = undefined;
      inner = undefined;
      client = undefined;
      state = { state: "refreshing" };
      await start();
    },
    capabilities: () =>
      inner?.capabilities?.() ?? (client ? relationCapabilitiesFromInitialize(client.status()) : options.capabilities),
    shutdown: async () => {
      try {
        if (client?.status().state === "ready") await client.shutdown();
      } finally {
        if (!disposed) {
          disposed = true;
          options.dispose?.();
        }
      }
    },
    query: async (request) => {
      await start();
      if (!inner) throw new Error("backend_unavailable");
      return inner.query(request);
    },
  };
}

function initialDocumentLocation(path: string): SymbolIdentity["location"] {
  return {
    path,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
}

function readiness(
  value: "initializing" | "ready" | "failed" | "unavailable",
): ReturnType<InjectedSemanticBackend["readiness"]> {
  if (value === "failed") return { state: "failed", failure_code: "backend_failed" };
  if (value === "initializing") return { state: "initializing" };
  if (value === "ready") return { state: "ready" };
  return { state: "unavailable" };
}
