import { rmSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRuntimeLaunchPolicy, resolveTrustedCommandRoots } from "../dist/semantic/adapter-selection/adapter-selection-policy.js";
import { loadAdapterSelectionRecord } from "../dist/semantic/adapter-selection/adapter-selection.js";
import { createNativeBackendInspector } from "../dist/semantic/adapters/native-backend-inspector.js";
import { createNativeProjectRoot } from "../dist/semantic/project-root/project-root.js";
import { createManagedPythonBackend } from "../dist/semantic/runtime/runtime-bootstrap.js";
import { createRuntimeLspBackend } from "../dist/semantic/runtime/runtime-lsp-backend.js";
import { collectObservations } from "./reproduce-real-lsp-observe.mjs";
import { fixture, language, temporaryRoot } from "./reproduce-real-lsp-fixture.mjs";
import { createTracingSpawn } from "./reproduce-real-lsp-tracing.mjs";

const record = loadAdapterSelectionRecord();
const roots = resolveTrustedCommandRoots(record.trusted_command_roots.win32);
const root = createNativeProjectRoot(temporaryRoot);
const policy = createRuntimeLaunchPolicy({ project_root: root.canonicalPath, platform: "win32", inspect: createNativeBackendInspector(roots, root.canonicalPath) });
const selected = record.runtime_backends.find((backend) => backend.language === language);
if (!selected) throw new Error(`missing ${language} selection`);
const spawnedProcesses = new Set();
const spawn = createTracingSpawn(temporaryRoot, spawnedProcesses);
function sourceRange(position, name) {
  const end = { line: position.line, character: position.character + name.length };
  return { start: position, end };
}

function symbol(id, name, position) {
  const location = { path: fixture.path, range: sourceRange(position, name) };
  return { id: `${language}:${id}`, name, language, kind: "function", location };
}
const sources = {
  helperDefinition: symbol("helper-definition", "helper", fixture.positions.helperDefinition),
  helperCall: symbol("helper-call", "helper", fixture.positions.helperCall),
  callerDefinition: symbol("caller-definition", "caller", fixture.positions.callerDefinition),
  externalCall: symbol("external-call", language === "csharp" ? "Console" : language === "python" ? "print" : "drop", fixture.positions.externalCall),
};
const capabilities = Object.fromEntries(["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [name, { state: "ready" }]));
const symbols = new Map(Object.values(sources).map((source) => [source.id, source]));
const backend = language === "python"
  ? createManagedPythonBackend(root, policy, selected.safe_initialization_options, capabilities, { symbols, spawn })
  : createRuntimeLspBackend({
      language,
      root,
      root_uri: pathToFileURL(root.canonicalPath).href,
      revision: { generation: 1, manifest_sha256: `real-${language}-reproduction` },
      symbols,
      capabilities,
      safe_initialization_options: selected.safe_initialization_options,
      toBackendUri: (location) => pathToFileURL(root.resolveClientPath(location.path)).href,
      fromBackendUri: (uri) => {
        if (!uri.startsWith("file:")) return undefined;
        const classified = root.classifyBackendPath(fileURLToPath(uri));
        return "relative_path" in classified ? classified.relative_path : undefined;
      },
      prepare: () => policy.prepare(language),
      confirmInitialized: () => policy.confirmInitialized(language),
      spawn,
    });

try {
  await backend.start();
  const observations = await collectObservations(backend, language, sources);
  console.error(JSON.stringify({ language, readiness: backend.readiness(), capabilities: backend.capabilities?.(), observations, public_mcp_boundary: "internal_adapter_practice_only_navigation_tools_land_in_tasks_3_and_4" }));
} catch (error) {
  console.error(JSON.stringify({ caught: error instanceof Error ? error.message : String(error), readiness: backend.readiness() }));
  process.exitCode = 1;
} finally {
  const shutdown = backend.shutdown?.();
  if (shutdown) {
    const completed = await Promise.race([shutdown.then(() => true), new Promise((resolve_) => setTimeout(() => resolve_(false), 4_000))]);
    if (!completed) { for (const child of spawnedProcesses) child.kill(); await shutdown; }
  }
  await new Promise((resolve_) => setTimeout(resolve_, 500));
  try { rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) { console.error(JSON.stringify({ cleanup: error instanceof Error ? error.message.replaceAll(temporaryRoot, "<fixture>") : String(error) })); }
}
