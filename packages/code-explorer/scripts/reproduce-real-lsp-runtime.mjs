import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createRuntimeLaunchPolicy,
  resolveTrustedCommandRoots,
} from "../dist/semantic/adapter-selection/adapter-selection-policy.js";
import {
  createNativeBackendInspector,
} from "../dist/semantic/adapters/native-backend-inspector.js";
import {
  createNativeProjectRoot,
} from "../dist/semantic/project-root/project-root.js";
import {
  createManagedPythonBackend,
} from "../dist/semantic/runtime/runtime-bootstrap.js";
import {
  createRuntimeLspBackend,
} from "../dist/semantic/runtime/runtime-lsp-backend.js";
import { createSources } from "./reproduce-real-lsp-symbols.mjs";
import { createTracingSpawn } from "./reproduce-real-lsp-tracing.mjs";
function createRuntimeContext({ record, language, temporaryRoot }) {
  const root = createNativeProjectRoot(temporaryRoot);
  const roots = resolveTrustedCommandRoots(record.trusted_command_roots.win32);
  const policy = createRuntimeLaunchPolicy({
    project_root: root.canonicalPath,
    platform: "win32",
    inspect: createNativeBackendInspector(roots, root.canonicalPath),
  });
  const selected = record.runtime_backends.find(
    (backend) => backend.language === language,
  );
  if (!selected) throw new Error(`missing ${language} selection`);
  const spawnedProcesses = new Set();
  return {
    root,
    policy,
    selected,
    spawnedProcesses,
    spawn: createTracingSpawn(temporaryRoot, spawnedProcesses),
  };
}
function runtimeOptions({ context, language, symbols, capabilities }) {
  const { root, policy, selected, spawn } = context;
  return {
    language,
    root,
    root_uri: pathToFileURL(root.canonicalPath).href,
    revision: {
      generation: 1,
      manifest_sha256: `real-${language}-reproduction`,
    },
    symbols,
    capabilities,
    safe_initialization_options: selected.safe_initialization_options,
    toBackendUri: (location) =>
      pathToFileURL(root.resolveClientPath(location.path)).href,
    fromBackendUri: (uri) => {
      if (!uri.startsWith("file:")) return undefined;
      const classified = root.classifyBackendPath(fileURLToPath(uri));
      return "relative_path" in classified
        ? classified.relative_path
        : undefined;
    },
    prepare: () => policy.prepare(language),
    confirmInitialized: () => policy.confirmInitialized(language),
    spawn,
  };
}

function createBackend({ context, language, sources, capabilities }) {
  const symbols = new Map(
    Object.values(sources).map((source) => [source.id, source]),
  );
  if (language === "python")
    return createManagedPythonBackend(
      context.root,
      context.policy,
      context.selected.safe_initialization_options,
      capabilities,
      { symbols, spawn: context.spawn },
    );
  return createRuntimeLspBackend(
    runtimeOptions({ context, language, symbols, capabilities }),
  );
}

export function createRuntime({ record, language, temporaryRoot, fixture }) {
  const context = createRuntimeContext({ record, language, temporaryRoot });
  const sources = createSources({ language, fixture });
  const capabilities = Object.fromEntries(
    "definition references type_definition implementation callers callees"
      .split(" ")
      .map((name) => [name, { state: "ready" }]),
  );
  return {
    backend: createBackend({ context, language, sources, capabilities }),
    spawnedProcesses: context.spawnedProcesses,
    sources,
  };
}
