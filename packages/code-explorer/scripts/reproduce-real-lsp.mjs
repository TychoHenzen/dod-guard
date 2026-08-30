import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  createRuntimeLaunchPolicy,
  loadAdapterSelectionRecord,
  resolveTrustedCommandRoots,
} from "../dist/semantic/adapter-selection.js";
import { createNativeBackendInspector } from "../dist/semantic/native-backend-inspector.js";
import { spawnNativeLspProcess } from "../dist/semantic/native-lsp-process.js";
import { createNativeProjectRoot } from "../dist/semantic/project-root.js";
import { createRuntimeLspBackend } from "../dist/semantic/runtime-lsp-backend.js";
import { createManagedPythonBackend } from "../dist/semantic/runtime-bootstrap.js";

const language = process.argv[2] ?? "rust";
if (!["rust", "python", "csharp"].includes(language)) throw new Error("expected rust, python, or csharp");
const temporaryRoot = mkdtempSync(join(tmpdir(), `code-explorer-real-${language}-`));
const fixture = {
  rust: {
    path: "src/lib.rs",
    text: "pub fn helper() {}\n\npub fn caller() {\n    helper();\n    std::mem::drop(1_u8);\n}\n",
    positions: {
      helperDefinition: { line: 0, character: 7 },
      helperCall: { line: 3, character: 4 },
      callerDefinition: { line: 2, character: 7 },
      externalCall: { line: 4, character: 14 },
    },
    setup() {
      mkdirSync(join(temporaryRoot, "src"));
      writeFileSync(
        join(temporaryRoot, "Cargo.toml"),
        '[package]\nname = "interop"\nversion = "0.1.0"\nedition = "2021"\n',
      );
    },
  },
  python: {
    path: "main.py",
    text: 'def helper():\n    pass\n\ndef caller():\n    helper()\n    print("x")\n',
    positions: {
      helperDefinition: { line: 0, character: 4 },
      helperCall: { line: 4, character: 4 },
      callerDefinition: { line: 3, character: 4 },
      externalCall: { line: 5, character: 4 },
    },
    setup() {},
  },
  csharp: {
    path: "Program.cs",
    text: 'using System;\npublic static class Program\n{\n    public static void Helper() {}\n    public static void Caller()\n    {\n        Helper();\n        Console.WriteLine("x");\n    }\n}\n',
    positions: {
      helperDefinition: { line: 3, character: 23 },
      helperCall: { line: 6, character: 8 },
      callerDefinition: { line: 4, character: 23 },
      externalCall: { line: 7, character: 8 },
    },
    setup() {
      writeFileSync(
        join(temporaryRoot, "interop.csproj"),
        '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
      );
    },
  },
}[language];
fixture.setup();
writeFileSync(join(temporaryRoot, ...fixture.path.split("/")), fixture.text);

const record = loadAdapterSelectionRecord();
const roots = resolveTrustedCommandRoots(record.trusted_command_roots.win32);
const root = createNativeProjectRoot(temporaryRoot);
const policy = createRuntimeLaunchPolicy({
  project_root: root.canonicalPath,
  platform: "win32",
  inspect: createNativeBackendInspector(roots, root.canonicalPath),
});
const selected = record.runtime_backends.find((backend) => backend.language === language);
if (!selected) throw new Error(`missing ${language} selection`);
const spawnedProcesses = new Set();

function tracingSpawn(executable, arguments_, environment) {
  const process = spawnNativeLspProcess(executable, arguments_, environment);
  spawnedProcesses.add(process);
  return {
    ...process,
    onStdout(listener) {
      process.onStdout((chunk) => {
        const text = new TextDecoder().decode(chunk);
        for (const body of text.split(/Content-Length: \d+\r\n\r\n/).filter(Boolean)) {
          try {
            const message = JSON.parse(body);
            const summary = {
              id: message.id,
              method: message.method,
              hasResult: Object.hasOwn(message, "result"),
              hasError: Object.hasOwn(message, "error"),
              error: message.error
                ? { code: message.error.code, message: String(message.error.message).replaceAll(temporaryRoot, "<fixture>") }
                : undefined,
              resultShape: Array.isArray(message.result)
                ? `array:${message.result.length}`
                : message.result === null
                  ? "null"
                  : typeof message.result,
            };
            console.error(JSON.stringify(summary));
          } catch {
            console.error(JSON.stringify({ undecodedBytes: chunk.byteLength }));
          }
        }
        listener(chunk);
      });
    },
    onExit(listener) {
      process.onExit(() => {
        spawnedProcesses.delete(process);
        listener();
      });
    },
  };
}

function symbol(id, name, position) {
  return {
    id: `${language}:${id}`,
    name,
    language,
    kind: "function",
    location: {
      path: fixture.path,
      range: { start: position, end: { line: position.line, character: position.character + name.length } },
    },
  };
}
const sources = {
  helperDefinition: symbol("helper-definition", "helper", fixture.positions.helperDefinition),
  helperCall: symbol("helper-call", "helper", fixture.positions.helperCall),
  callerDefinition: symbol("caller-definition", "caller", fixture.positions.callerDefinition),
  externalCall: symbol("external-call", language === "csharp" ? "Console" : language === "python" ? "print" : "drop", fixture.positions.externalCall),
};
const capabilities = Object.fromEntries(
  ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
    name,
    { state: "ready" },
  ]),
);
const symbols = new Map(Object.values(sources).map((source) => [source.id, source]));
const backend =
  language === "python"
    ? createManagedPythonBackend(root, policy, selected.safe_initialization_options, capabilities, {
        symbols,
        spawn: tracingSpawn,
      })
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
  spawn: tracingSpawn,
});

try {
  await backend.start();
  const observations = {};
  async function observe(name, operation, source) {
    try {
      let result = await backend.query({ operation, symbol_id: source.id });
      if (language === "rust" && operation === "definition" && result.relations?.length === 0) {
        for (let retry = 0; retry < 4 && result.relations.length === 0; retry++) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          result = await backend.query({ operation, symbol_id: source.id });
        }
      }
      observations[name] = {
        status: "returned",
        relation_count: result.relations?.length ?? 0,
        local_count: result.relations?.filter((relation) => relation.symbol).length ?? 0,
        external_count: result.relations?.filter((relation) => relation.external).length ?? 0,
      };
    } catch (error) {
      observations[name] = { status: "unavailable", code: error instanceof Error ? error.message : String(error) };
    }
  }

  await observe("definition", "definition", sources.helperCall);
  if (language === "rust") await new Promise((resolve) => setTimeout(resolve, 2_000));
  await observe("references", "references", sources.helperDefinition);
  await observe("callers", "callers", sources.helperDefinition);
  await observe("callees", "callees", sources.callerDefinition);
  await observe("external_definition", "definition", sources.externalCall);
  await observe("implementation", "implementation", sources.helperDefinition);
  await observe("unavailable_relation", "implementation", { id: `${language}:missing-handle` });
  console.error(
    JSON.stringify({
      language,
      readiness: backend.readiness(),
      capabilities: backend.capabilities?.(),
      observations,
      public_mcp_boundary: "internal_adapter_practice_only_navigation_tools_land_in_tasks_3_and_4",
    }),
  );
} catch (error) {
  console.error(JSON.stringify({ caught: error instanceof Error ? error.message : String(error), readiness: backend.readiness() }));
  process.exitCode = 1;
} finally {
  const shutdown = backend.shutdown?.();
  if (shutdown) {
    const completed = await Promise.race([
      shutdown.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 4_000)),
    ]);
    if (!completed) {
      for (const child of spawnedProcesses) child.kill();
      await shutdown;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.error(JSON.stringify({ cleanup: error instanceof Error ? error.message.replaceAll(temporaryRoot, "<fixture>") : String(error) }));
  }
}
