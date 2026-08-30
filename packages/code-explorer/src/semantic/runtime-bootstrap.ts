import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createRuntimeLaunchPolicy,
  loadAdapterSelectionRecord,
  resolveTrustedCommandRoots,
} from "./adapter-selection.js";
import type { Language, RelationCapabilities, SemanticRequest, SemanticResult } from "./contract.js";
import {
  createCSharpAdapter,
  createPythonAdapter,
  createRustAdapter,
  type InjectedSemanticBackend,
  type LanguageAdapter,
} from "./language-adapter.js";
import { createNativeBackendInspector } from "./native-backend-inspector.js";
import type { ProjectRoot } from "./project-root.js";
import { createPythonMirrorManager } from "./python-mirror-runtime.js";
import { createRuntimeLspBackend } from "./runtime-lsp-backend.js";

const unavailableBackend = {
  readiness: () => ({ state: "unavailable" as const }),
  query: async (_request: SemanticRequest): Promise<SemanticResult> => {
    throw new Error("backend_unavailable");
  },
};

/** Builds status-visible adapters exclusively from the checked-in selection. */
export function createRuntimeAdapters(projectRoot: ProjectRoot): readonly LanguageAdapter[] {
  const record = loadAdapterSelectionRecord();
  const platform = process.platform === "win32" ? "win32" : "posix";
  const commandRoots =
    platform === "win32"
      ? resolveTrustedCommandRoots(record.trusted_command_roots.win32)
      : ["/opt/code-explorer/backends"];
  const policy = createRuntimeLaunchPolicy({
    project_root: projectRoot.canonicalPath,
    platform,
    inspect: createNativeBackendInspector(commandRoots, projectRoot.canonicalPath),
  });
  const adapters = record.runtime_backends.map((backend) => {
    const capabilities = Object.fromEntries(
      Object.entries(backend.capabilities).map(([name, state]) => [name, { state }]),
    ) as RelationCapabilities;
    if (backend.language === "python") {
      const prepared = policy.prepare("python");
      const options = {
        backend:
          prepared.status === "ready"
            ? createManagedPythonBackend(projectRoot, policy, backend.safe_initialization_options, capabilities)
            : unavailableBackend,
        compatible: true,
        backend_name: backend.platform_executables[platform],
        backend_version: prepared.status === "ready" ? prepared.version : "unobserved",
        discovery_source: "server_path" as const,
        unavailable_failure_code: prepared.status === "unavailable" ? prepared.code : "backend_unavailable",
        capabilities,
      };
      return makeAdapter("python", options);
    }
    const prepared = policy.prepare(backend.language);
    const options = {
      backend:
        prepared.status === "ready"
          ? createRuntimeLspBackend({
              language: backend.language,
              root: projectRoot,
              root_uri: pathToFileURL(projectRoot.canonicalPath).href,
              revision: { generation: 0, manifest_sha256: "runtime" },
              symbols: new Map(),
              capabilities,
              safe_initialization_options: backend.safe_initialization_options,
              toBackendUri: (location) => pathToFileURL(projectRoot.resolveClientPath(location.path)).href,
              fromBackendUri: (uri) => {
                if (!uri.startsWith("file:")) return undefined;
                const classified = projectRoot.classifyBackendPath(fileURLToPath(uri));
                return "relative_path" in classified ? classified.relative_path : undefined;
              },
              prepare: () => policy.prepare(backend.language),
              confirmInitialized: () => policy.confirmInitialized(backend.language),
            })
          : unavailableBackend,
      compatible: true,
      backend_name: backend.platform_executables[platform],
      backend_version: prepared.status === "ready" ? prepared.version : "unobserved",
      discovery_source: "server_path" as const,
      unavailable_failure_code: prepared.status === "unavailable" ? prepared.code : "backend_unavailable",
      capabilities,
    };
    return makeAdapter(backend.language, options);
  });
  return adapters;
}

function createManagedPythonBackend(
  projectRoot: ProjectRoot,
  policy: ReturnType<typeof createRuntimeLaunchPolicy>,
  safeInitializationOptions: Record<string, unknown>,
  capabilities: RelationCapabilities,
) {
  let inner: ReturnType<typeof createRuntimeLspBackend> | undefined;
  let state: ReturnType<InjectedSemanticBackend["readiness"]> = { state: "initializing" };
  const manager = createPythonMirrorManager(projectRoot, async () => {
    await inner?.shutdown?.();
    inner = undefined;
  });
  const build = async () => {
    const refreshed = await manager.refresh();
    if (refreshed.status !== "ready") {
      state = { state: "unavailable" };
      throw new Error(refreshed.code);
    }
    if (!inner || refreshed.changed) {
      const mirror = refreshed.mirror;
      inner = createRuntimeLspBackend({
        language: "python",
        root: projectRoot,
        root_uri: pathToFileURL(mirror.root).href,
        revision: { generation: mirror.generation, manifest_sha256: "python-mirror" },
        symbols: new Map(),
        capabilities,
        safe_initialization_options: safeInitializationOptions,
        toBackendUri: (location) => mirror.uriFor(location.path),
        fromBackendUri: (uri) => mirror.pathForUri(uri),
        prepare: () => policy.prepare("python"),
        confirmInitialized: () => policy.confirmInitialized("python"),
      });
    }
    await inner.start?.();
    state = inner.readiness();
  };
  return {
    readiness: () => inner?.readiness() ?? state,
    capabilities: () => inner?.capabilities?.() ?? capabilities,
    start: build,
    refresh: build,
    shutdown: async () => {
      await manager.disposeAfterShutdown(async () => {
        await inner?.shutdown?.();
        inner = undefined;
      });
      state = { state: "unavailable" };
    },
    query: async (request: SemanticRequest) => {
      await build();
      if (!inner) throw new Error("backend_unavailable");
      return inner.query(request);
    },
  };
}

/** Starts every selected backend before the MCP surface can expose its status. */
export async function createStartedRuntimeAdapters(projectRoot: ProjectRoot): Promise<readonly LanguageAdapter[]> {
  const adapters = createRuntimeAdapters(projectRoot);
  await Promise.allSettled(adapters.map((adapter) => adapter.start?.()));
  return adapters;
}

function makeAdapter(language: Language, options: Parameters<typeof createRustAdapter>[0]): LanguageAdapter {
  if (language === "rust") return createRustAdapter(options);
  if (language === "python") return createPythonAdapter(options);
  return createCSharpAdapter(options);
}
