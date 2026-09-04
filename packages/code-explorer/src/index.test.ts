import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer, toMcpToolResult } from "./index.js";
import type { LanguageAdapter } from "./semantic/language-adapter.js";
import { createNativeProjectRoot } from "./semantic/project-root.js";
import { FakeSemanticAdapter } from "./testing/fake-semantic-adapter.js";

const entryPoint = fileURLToPath(new URL("./index.js", import.meta.url));

type FakeBackendLog = {
  starts: number;
  shutdowns: number;
  exits: number;
  root_uri?: string;
  initialization_options?: unknown;
  configuration_sections: string[];
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function waitForFakeConfiguration(counter: string): Promise<void> {
  let observed = "";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const log = JSON.parse(readFileSync(counter, "utf8")) as FakeBackendLog;
    observed = JSON.stringify(log);
    if (log.configuration_sections.length === 3) return;
    await new Promise((resolve_) => setTimeout(resolve_, 20));
  }
  throw new Error(`fake_backend_configuration_timeout:${observed}`);
}

/** Windows keeps a process working directory locked until the MCP child has observed transport close. */
async function removeTemporaryTree(path: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 1, retryDelay: 20 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve_) => setTimeout(resolve_, 20));
    }
  }
  throw lastError;
}

function writeFakeLspServer(path: string): void {
  writeFileSync(
    path,
    `import { readFileSync, writeFileSync } from "node:fs";
const logPath = process.env.CODE_EXPLORER_FAKE_COUNTER;
const log = () => JSON.parse(readFileSync(logPath, "utf8"));
const save = (value) => writeFileSync(logPath, JSON.stringify(value));
const record = (change) => { const value = log(); change(value); save(value); };
const send = (message) => { const body = Buffer.from(JSON.stringify(message)); process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n"); process.stdout.write(body); };
let input = Buffer.alloc(0);
const receive = (message) => {
  if (message.method === "initialize") {
    record((value) => { value.starts += 1; value.root_uri = message.params.rootUri; value.initialization_options = message.params.initializationOptions; });
    send({ jsonrpc: "2.0", id: message.id, result: { capabilities: { definitionProvider: true, referencesProvider: true } } });
    return;
  }
  if (message.method === "initialized") {
    send({ jsonrpc: "2.0", id: 71, method: "workspace/configuration", params: { items: [{ section: "python.pythonPath" }, { section: "python.venvPath" }, { section: "python.analysis.extraPaths" }] } });
    return;
  }
  if (message.id === 71 && Array.isArray(message.result)) {
    record((value) => { value.configuration_sections = message.result.map((item) => JSON.stringify(item)); });
    return;
  }
  if (message.method === "textDocument/definition") {
    send({ jsonrpc: "2.0", id: message.id, result: [] });
    return;
  }
  if (message.method === "shutdown") {
    record((value) => { value.shutdowns += 1; });
    send({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }
  if (message.method === "exit") {
    record((value) => { value.exits += 1; });
    process.exit(0);
  }
};
process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  for (;;) {
    const boundary = input.indexOf("\\r\\n\\r\\n");
    if (boundary < 0) return;
    const length = /^Content-Length: (\\d+)$/.exec(input.subarray(0, boundary).toString("ascii"));
    if (!length) process.exit(2);
    const end = boundary + 4 + Number(length[1]);
    if (input.length < end) return;
    receive(JSON.parse(input.subarray(boundary + 4, end).toString("utf8")));
    input = input.subarray(end);
  }
});
`,
    "utf8",
  );
}

function createStandaloneBackendRecord(
  root: string,
  counters: Record<string, string>,
): { record: unknown; evidence: unknown } {
  const version = process.version.replace(/^v/, "");
  const fixtureHashes = Object.fromEntries(
    ["rust", "python", "csharp"].map((language) => [language, sha256(`${language}:fixture`)]),
  );
  const executable = (language: string) =>
    language === "rust" ? "rust-analyzer.exe" : language === "python" ? "node.exe" : "roslyn-language-server.exe";
  const safeOptions = (language: string) =>
    language === "rust"
      ? {
          cargo: { buildScripts: { enable: false }, procMacro: { enable: false }, checkOnSave: { enable: false } },
          projectConfiguration: { enable: false },
        }
      : language === "python"
        ? { use_project_environment: false, mirror_only: true }
        : { analyzers: false, source_generators: false };
  const entrypoints = (language: string) => [`${language}-server.js`];
  const packageMetadataPath = join(root, "node_modules", "pyright", "package.json");
  const packageMetadataHash = sha256(readFileSync(packageMetadataPath));
  const executablePath = (language: string) =>
    language === "csharp"
      ? join(
          root,
          ".store",
          "roslyn-language-server",
          "5.11.0-1.26380.4",
          "roslyn-language-server.win-x64",
          "5.11.0-1.26380.4",
          "tools",
          "net10.0",
          "win-x64",
          executable(language),
        )
      : join(root, executable(language));
  const authorization = (language: string) => {
    const executableName = executable(language);
    const entrypointNames = entrypoints(language);
    const versionProbe =
      language === "python"
        ? {
            method: "package_json",
            command_root: "code_explorer_backends",
            executable: executableName,
            entrypoints: entrypointNames,
            arguments: [],
            command_template: "<code_explorer_backends>/node_modules/pyright/package.json",
          }
        : {
            method: "command",
            command_root: "code_explorer_backends",
            executable: executableName,
            entrypoints: entrypointNames,
            arguments: ["--version"],
            command_template: `<code_explorer_backends>/${executableName} --version`,
          };
    return {
      executable_sha256: sha256(readFileSync(executablePath(language))),
      entrypoint_sha256s: entrypointNames.map((entrypoint) =>
        sha256(readFileSync(join(root, "node_modules", "pyright", entrypoint))),
      ),
      package_metadata_sha256: language === "python" ? packageMetadataHash : null,
      version_probe: versionProbe,
    };
  };
  const backends = ["rust", "python", "csharp"].map((language) => ({
    language,
    platform_executables: { win32: executable(language), posix: executable(language).replace(/\\.exe$/, "") },
    platform_entrypoints: { win32: entrypoints(language), posix: entrypoints(language) },
    compatible_version: version,
    arguments: ["{entrypoint:0}"],
    endpoint: "stdio",
    environment: { CODE_EXPLORER_FAKE_COUNTER: counters[language] ?? "" },
    safe_initialization_options: safeOptions(language),
    capabilities: {
      definition: "unavailable",
      references: "unavailable",
      type_definition: "unavailable",
      implementation: "unavailable",
      callers: "unavailable",
      callees: "unavailable",
    },
    sentinel_evidence: {
      fixture: `fixtures/${language}`,
      platform: "win32",
      fixture_sha256: fixtureHashes[language] ?? "",
      side_effect_absent: true,
      result: "passed",
      passed: true,
    },
    authorization: authorization(language),
  }));
  const sentinel = (language: string) => {
    const identity = authorization(language);
    return {
      executable: executable(language),
      executable_sha256: identity.executable_sha256,
      entrypoints: entrypoints(language),
      entrypoint_sha256s: identity.entrypoint_sha256s,
      package_metadata_sha256: identity.package_metadata_sha256,
      backend_version: version,
      fixture_sha256: fixtureHashes[language] ?? "",
      version_probe: identity.version_probe,
      startup: true,
      definition_navigation: true,
      side_effect_absent: true,
      stderr: "",
      positive_control: { initialized: true, definition_responded: true, side_effect_absent: false },
    };
  };
  return {
    record: {
      schema_version: 1,
      source_dependency_versions: { serena: "test-only", "@p1va/symbols": "test-only" },
      evidence_artifact: "adapter-selection-evidence.json",
      trusted_command_roots: { posix: ["posix_code_explorer_backends"], win32: ["code_explorer_backends"] },
      selected_paths: {
        rust: "direct_standard_public_lsp",
        python: "direct_standard_public_lsp",
        csharp: "direct_standard_public_lsp",
      },
      runtime_backends: backends,
    },
    evidence: {
      schema_version: 1,
      recorded_at: "2026-08-30T00:00:00.000Z",
      purpose: "Standalone installed-package test fixture.",
      platforms: {
        win32: {
          status: "passed",
          command_roots: ["code_explorer_backends"],
          commands: ["test fixture"],
          bounded_output: "test fixture",
          backend_versions: { rust: version, python: version, csharp: version },
          positive_controls: { rust: "passed", python: "passed", csharp: "passed" },
        },
        posix: {
          status: "unproven",
          command_roots: ["posix_code_explorer_backends"],
          commands: [],
          bounded_output: "not run",
          backend_versions: { rust: null, python: null, csharp: null },
          positive_controls: { rust: "not_run", python: "not_run", csharp: "not_run" },
        },
      },
      fixture_tree_hashes: fixtureHashes,
      sentinel_runs: {
        rust: sentinel("rust"),
        python: { ...sentinel("python"), environment: { PATH: "", PYTHONPATH: "", VIRTUAL_ENV: "", CONDA_PREFIX: "" } },
        csharp: sentinel("csharp"),
      },
    },
  };
}

describe("code-explorer package boundary", () => {
  it("starts all approved standalone backends from a copied installed package without project-path leakage", async () => {
    if (process.platform !== "win32") return;
    const temporary = mkdtempSync(join(tmpdir(), "code-explorer-standalone-ready-"));
    const installed = join(temporary, "node_modules", "code-explorer");
    const project = join(temporary, "project");
    const backendRoot = join(temporary, "trusted-backends");
    const counters = Object.fromEntries(
      ["rust", "python", "csharp"].map((language) => [language, join(temporary, `${language}-counter.json`)]),
    );
    const packageRoot = dirname(dirname(entryPoint));
    try {
      mkdirSync(join(installed, "dist"), { recursive: true });
      mkdirSync(join(backendRoot, "node_modules", "pyright"), { recursive: true });
      mkdirSync(project);
      writeFileSync(join(project, "module.py"), "def symbol():\n    return 1\n", "utf8");
      for (const counter of Object.values(counters))
        writeFileSync(
          counter,
          JSON.stringify({ starts: 0, shutdowns: 0, exits: 0, configuration_sections: [] }),
          "utf8",
        );
      for (const executable of ["rust-analyzer.exe", "node.exe"])
        copyFileSync(process.execPath, join(backendRoot, executable));
      const roslynStore = join(
        backendRoot,
        ".store",
        "roslyn-language-server",
        "5.11.0-1.26380.4",
        "roslyn-language-server.win-x64",
        "5.11.0-1.26380.4",
        "tools",
        "net10.0",
        "win-x64",
      );
      mkdirSync(roslynStore, { recursive: true });
      copyFileSync(process.execPath, join(roslynStore, "roslyn-language-server.exe"));
      for (const language of ["rust", "python", "csharp"])
        writeFakeLspServer(join(backendRoot, "node_modules", "pyright", `${language}-server.js`));
      writeFileSync(
        join(backendRoot, "node_modules", "pyright", "package.json"),
        JSON.stringify({ version: process.version.slice(1) }),
      );
      const { record, evidence } = createStandaloneBackendRecord(backendRoot, counters);
      copyFileSync(join(packageRoot, "dist", "bundle.js"), join(installed, "dist", "bundle.js"));
      copyFileSync(join(packageRoot, "package.json"), join(installed, "package.json"));
      writeFileSync(join(installed, "adapter-selection.json"), JSON.stringify(record));
      writeFileSync(join(installed, "adapter-selection-evidence.json"), JSON.stringify(evidence));

      const client = new Client({ name: "code-explorer-standalone-ready-test", version: "1.0.0" });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(installed, "dist", "bundle.js"), "--project-root", project],
        cwd: project,
        env: {
          PATH: "",
          SystemRoot: process.env.SystemRoot ?? "",
          CODE_EXPLORER_BACKENDS_ROOT: backendRoot,
        },
      });
      try {
        await client.connect(transport);
        const response = (await client.callTool({ name: "code_status", arguments: { action: "status" } })) as {
          content: Array<{ text: string }>;
        };
        const status = JSON.parse(response.content[0]?.text ?? "") as {
          data: {
            backend_status: {
              backends: Array<{
                language: string;
                state: string;
                backend_version: string;
                capabilities: Record<string, { state: string }>;
              }>;
            };
          };
        };
        const backends = status.data.backend_status.backends;
        assert.deepEqual(
          backends.map(({ language }) => language),
          ["rust", "python", "csharp"],
        );
        assert.ok(
          backends.every(({ state }) => state === "degraded"),
          JSON.stringify(backends),
        );
        assert.ok(backends.every(({ backend_version }) => backend_version === process.version.slice(1)));
        assert.ok(backends.every(({ capabilities }) => capabilities.definition?.state === "ready"));
        assert.equal(JSON.stringify(status).includes(project), false);
        await waitForFakeConfiguration(counters.python ?? "");
      } finally {
        await client.close();
      }
      for (const language of ["rust", "python", "csharp"]) {
        const log = JSON.parse(readFileSync(counters[language] ?? "", "utf8")) as FakeBackendLog;
        assert.equal(log.starts, 1, `${language} launched once after the pre-spawn identity check`);
        assert.equal(log.shutdowns, 1, `${language} received a clean shutdown`);
        assert.equal(log.exits, 1, `${language} received exit after shutdown`);
        assert.deepEqual(log.configuration_sections, language === "python" ? ["[]", "[]", "[]"] : []);
        assert.equal(JSON.stringify(log.initialization_options).includes(project), false);
        if (language === "python") {
          assert.notEqual(log.root_uri, new URL(`file:///${project.replaceAll("\\\\", "/")}/`).href);
          assert.match(log.root_uri ?? "", /^file:/);
          assert.equal((log.root_uri ?? "").includes(project.replaceAll("\\", "/")), false);
        }
      }
    } finally {
      await removeTemporaryTree(temporary);
    }
  });

  it("keeps the production bundle free of spike and rejected-dependency imports", () => {
    const bundle = readFileSync(join(dirname(dirname(entryPoint)), "dist", "bundle.js"), "utf8");
    assert.equal(/(?:import|require)\([^)]*(?:spike|serena|@p1va\/symbols)/i.test(bundle), false);
    assert.equal(/node_modules[\\/](?:serena|@p1va)[\\/]/i.test(bundle), false);
  });
  it("runs the bundled installed package with only its production record and no spike tree", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "code-explorer-installed-"));
    const installed = join(temporary, "node_modules", "code-explorer");
    const project = join(temporary, "project");
    const packageRoot = dirname(dirname(entryPoint));
    mkdirSync(join(installed, "dist"), { recursive: true });
    mkdirSync(project);
    copyFileSync(join(packageRoot, "dist", "bundle.js"), join(installed, "dist", "bundle.js"));
    copyFileSync(join(packageRoot, "package.json"), join(installed, "package.json"));
    copyFileSync(join(packageRoot, "adapter-selection.json"), join(installed, "adapter-selection.json"));
    copyFileSync(
      join(packageRoot, "adapter-selection-evidence.json"),
      join(installed, "adapter-selection-evidence.json"),
    );

    const client = new Client({ name: "code-explorer-installed-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(installed, "dist", "bundle.js"), "--project-root", project],
      env: { PATH: "" },
    });
    try {
      await client.connect(transport);
      let backends: Array<{ language: string; state: string; failure_code?: string }> = [];
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = (await client.callTool({ name: "code_status", arguments: { action: "status" } })) as {
          content: Array<{ text: string }>;
        };
        const envelope = JSON.parse(response.content[0]?.text ?? "") as {
          data: { backend_status: { backends: Array<{ language: string; state: string; failure_code?: string }> } };
        };
        backends = envelope.data.backend_status.backends;
        if (backends.every(({ state }) => state !== "initializing")) break;
        await new Promise((resolve_) => setTimeout(resolve_, 20));
      }
      assert.deepEqual(
        backends.map(({ language }) => language),
        ["rust", "python", "csharp"],
      );
      assert.ok(backends.every(({ state }) => state !== "initializing"));
      const csharp = backends.find(({ language }) => language === "csharp");
      // A copied package has no spike tree. A separately pinned tool-store payload may still be available.
      assert.ok(csharp?.state === "ready" || csharp?.state === "unavailable");
      if (csharp?.state === "unavailable") assert.equal(csharp.failure_code, "backend_unavailable");
    } finally {
      await client.close();
      await removeTemporaryTree(temporary);
    }
  });

  it("completes initialize and tools/list through the compiled MCP process", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint], cwd: process.cwd() });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
        "code_focus",
        "code_follow",
        "code_history",
        "code_search",
        "code_status",
      ]);
    } finally {
      await client.close();
    }
  });
  it("gives every advertised tool its own operation-specific description", async () => {
    const client = new Client({ name: "code-explorer-metadata-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint], cwd: process.cwd() });
    try {
      await client.connect(transport);
      const descriptions = (await client.listTools()).tools.map(({ description }) => description);
      assert.equal(new Set(descriptions).size, 5);
      assert.ok(descriptions.every((description) => description && description.length > 30));
    } finally {
      await client.close();
    }
  });
  it("returns success envelopes through structuredContent and matching JSON text", async () => {
    const result = await createServer().call("code_status", { action: "start_session" });
    assert.equal("code" in result, false);
    const response = toMcpToolResult(result);
    assert.deepEqual(response.structuredContent, JSON.parse(response.content[0]?.text ?? ""));
  });

  it("uses an explicit startup root and redacts invalid root paths in the compiled child", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entryPoint, "--project-root", process.cwd()],
      cwd: process.cwd(),
    });
    try {
      await client.connect(transport);
      assert.equal((await client.listTools()).tools.length, 5);
    } finally {
      await client.close();
    }

    const invalid = spawnSync(process.execPath, [entryPoint, "--project-root", "missing-project-root"], {
      encoding: "utf8",
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /invalid_project_root:project_root/);
    assert.equal(invalid.stderr.includes("missing-project-root"), false);
  });
  it("advertises exactly the five read-only navigation tools", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint], cwd: process.cwd() });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      assert.deepEqual(names.sort(), ["code_focus", "code_follow", "code_history", "code_search", "code_status"]);
      assert.equal(
        names.some((name) => /rename|create|update|delete/.test(name)),
        false,
      );
    } finally {
      await client.close();
    }
  });
  it("returns a structured unknown-tool error without changing state", async () => {
    const server = createServer();
    const before = server.state();
    const result = await server.call("rename", {});

    assert.deepEqual(result, {
      schema_version: 1,
      code: "unknown_tool",
      message: "unknown_tool",
      retryable: false,
    });
    assert.deepEqual(server.state(), before);

    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint], cwd: process.cwd() });
    try {
      await client.connect(transport);
      const response = (await client.callTool({ name: "rename", arguments: {} })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      assert.equal(response.isError, true);
      assert.deepEqual(JSON.parse(response.content[0]?.text ?? ""), {
        schema_version: 1,
        code: "unknown_tool",
        message: "unknown_tool",
        retryable: false,
      });
    } finally {
      await client.close();
    }
  });
  it("returns error envelopes through structuredContent and matching JSON text", async () => {
    const client = new Client({ name: "code-explorer-structured-error-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint], cwd: process.cwd() });
    try {
      await client.connect(transport);
      const response = (await client.callTool({ name: "not_a_tool", arguments: {} })) as {
        isError?: boolean;
        structuredContent: unknown;
        content: Array<{ text: string }>;
      };
      assert.equal(response.isError, true);
      assert.deepEqual(response.structuredContent, JSON.parse(response.content[0]?.text ?? ""));
    } finally {
      await client.close();
    }
  });
  it("refreshes only derived state and preserves view history", async () => {
    const server = createServer();
    const sessionId = await startSession(server);
    const before = server.state();
    const result = await server.call("code_status", {
      action: "refresh",
      session_id: sessionId,
      request_id: "refresh-request-0001",
    });

    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected a successful refresh");
    assert.equal(result.state, "refreshed");
    assert.equal(server.state().refresh_generation, before.refresh_generation + 1);
    assert.deepEqual(server.state().view_history, before.view_history);
  });

  it("reports only the aggregate sensitive exclusion count", async () => {
    const server = createServer({ sensitive_paths_excluded: 2 });
    const result = await server.call("code_status", { action: "status" });
    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected status");
    assert.equal((result.data as { sensitive_paths_excluded?: unknown }).sensitive_paths_excluded, 2);
    assert.deepEqual((result.data as { backend_status?: { backends?: unknown } }).backend_status?.backends, []);
    assert.equal(JSON.stringify(result).includes(".env"), false);
  });
  it("rejects unknown and action-mismatched fields before state work", async () => {
    const server = createServer();
    const before = server.state();

    for (const [name, arguments_] of [
      ["code_search", { query: "helper", unexpected: true }],
      ["code_focus", { session_id: "session", request_id: "request", symbol_id: "symbol", limit: 1 }],
      [
        "code_follow",
        {
          session_id: "session",
          request_id: "request",
          view_id: "view",
          handle: "handle",
          relation: "definition",
          extra: 1,
        },
      ],
      ["code_history", { session_id: "session", request_id: "request", action: "back", limit: 1 }],
      ["code_status", { action: "status", session_id: "session" }],
      ["code_status", { action: "refresh", session_id: "session" }],
    ] as const) {
      const result = await server.call(name, arguments_);
      assert.deepEqual(result, {
        schema_version: 1,
        code: "invalid_request",
        message: "invalid_request",
        retryable: false,
      });
    }

    assert.deepEqual(server.state(), before);
  });

  it("advertises closed action variants for history and status", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint], cwd: process.cwd() });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const schemas = new Map(
        tools.map((tool) => [
          tool.name,
          tool.inputSchema as unknown as {
            oneOf: Array<{ properties: Record<string, unknown>; required: string[]; additionalProperties: boolean }>;
          },
        ]),
      );
      const history = schemas.get("code_history")?.oneOf;
      const status = schemas.get("code_status")?.oneOf;

      assert.equal(history?.length, 2);
      assert.equal("limit" in (history?.[0]?.properties ?? {}), false);
      assert.equal(
        history?.every((branch) => branch.additionalProperties === false),
        true,
      );
      assert.equal(status?.length, 3);
      assert.equal("session_id" in (status?.[0]?.properties ?? {}), false);
      assert.equal("session_id" in (status?.[1]?.properties ?? {}), false);
      assert.deepEqual(status?.[2]?.required, ["action", "session_id", "request_id"]);
      assert.equal(
        status?.every((branch) => branch.additionalProperties === false),
        true,
      );
    } finally {
      await client.close();
    }
  });
  it("returns only the common versioned envelope for every successful tool", async () => {
    const server = createServer({ adapters: [focusableNavigationAdapter()] });
    const sessionId = await startSession(server);
    const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["code_search", { query: "helper" }],
      ["code_focus", { session_id: sessionId, request_id: "focus-request-00001", symbol_id: "symbol" }],
      ["code_history", { session_id: sessionId, request_id: "history-request-001", action: "recent", limit: 1 }],
      ["code_status", { action: "status" }],
    ];

    for (const [name, arguments_] of calls) {
      const result = await server.call(name, arguments_);
      assert.equal("code" in result, false);
      if ("code" in result) throw new Error(`${name} unexpectedly failed`);
      assert.deepEqual(Object.keys(result).sort(), [
        "data",
        "pending_generation",
        "project_generation",
        "project_id",
        "schema_version",
        "state",
      ]);
      assert.equal(result.schema_version, 1);
      assert.equal(typeof result.project_id, "string");
      assert.equal(typeof result.project_generation, "number");
      assert.equal(result.pending_generation, null);
    }
    const focused = await server.call("code_focus", {
      session_id: sessionId,
      request_id: "focus-request-00002",
      symbol_id: "symbol",
    });
    if ("code" in focused) throw new Error("expected focus");
    const data = focused.data as { view_id: string; handles: Array<{ handle: string }> };
    const followed = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "follow-request-0001",
      view_id: data.view_id,
      handle: data.handles[0]?.handle ?? "missing",
      relation: "definition",
    });
    assert.equal("code" in followed, false);
  });
  it("makes an unsupported relation explicit instead of returning an empty result array", async () => {
    const server = createServer({ adapters: [focusableNavigationAdapter()] });
    const sessionId = await startSession(server);
    const focused = await server.call("code_focus", {
      session_id: sessionId,
      request_id: "focus-request-00001",
      symbol_id: "symbol",
    });
    if ("code" in focused) throw new Error("expected focus");
    const data = focused.data as { view_id: string; handles: Array<{ handle: string }> };
    for (const [index, relation] of [
      "definition",
      "references",
      "callers",
      "callees",
      "type",
      "implementation",
    ].entries()) {
      const result = await server.call("code_follow", {
        session_id: sessionId,
        request_id: `follow-request-${index.toString().padStart(4, "0")}`,
        view_id: data.view_id,
        handle: data.handles[0]?.handle ?? "missing",
        relation,
      });

      assert.equal("code" in result, false);
      if ("code" in result) throw new Error("expected an unavailable relation result");
      assert.equal(result.state, "unavailable_relation");
      assert.deepEqual(result.data, { relation });
      assert.equal(Array.isArray((result.data as Record<string, unknown>).results), false);
    }
  });

  it("keeps the owning language relation when another ready adapter does not own the symbol", async () => {
    const focused = symbol("function", "src/helper.rs");
    const capabilities = Object.fromEntries(
      ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
        name,
        { state: "ready" },
      ]),
    ) as never;
    const status = (language: "rust" | "python") => ({
      language,
      backend_name: language,
      backend_version: "test",
      discovery_source: "injected" as const,
      state: "ready" as const,
      capabilities,
      last_transition_time: 0,
    });
    const owner: LanguageAdapter = {
      status: () => status("rust"),
      request: async (request) =>
        request.operation === "focus"
          ? {
              operation: "focus",
              revision: { generation: 1, manifest_sha256: "test" },
              symbol: focused,
              content: { body: "helper", visible_symbols: [{ name: "helper", symbol_id: focused.id }] },
            }
          : {
              operation: "definition",
              revision: { generation: 1, manifest_sha256: "test" },
              relations: [{ relation: "definition", symbol: focused, location: focused.location }],
            },
    } as LanguageAdapter;
    const unrelated: LanguageAdapter = {
      status: () => status("python"),
      request: async () => {
        throw new Error("backend_unavailable");
      },
    };
    const server = createServer({ adapters: [owner, unrelated] });
    const sessionId = await startSession(server);
    const focus = await server.call("code_focus", {
      session_id: sessionId,
      request_id: "focus-request-00001",
      symbol_id: focused.id,
    });
    if ("code" in focus) throw new Error("expected focus");
    const data = focus.data as { view_id: string; handles: Array<{ handle: string }> };

    const followed = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "follow-request-0001",
      view_id: data.view_id,
      handle: data.handles[0]?.handle ?? "missing",
      relation: "definition",
    });

    assert.equal("code" in followed, false);
    assert.equal("code" in followed ? undefined : followed.state, "ready");
  });

  it("lets tests control semantic adapter readiness, results, and failures", async () => {
    const adapter = new FakeSemanticAdapter<number>();
    assert.deepEqual(adapter.readiness(), { state: "unavailable" });

    adapter.setReady();
    adapter.setResult(7);
    assert.deepEqual(adapter.readiness(), { state: "ready" });
    assert.equal(await adapter.query(), 7);

    adapter.setFailure(new Error("semantic backend stopped"));
    await assert.rejects(adapter.query(), /semantic backend stopped/);
  });

  it("uses the production search boundary to filter generated files and report invalid classification configuration", async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-server-discovery-"));
    try {
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "generated"));
      writeFileSync(join(root, "src", "Helper.ts"), "export const helper = 1;\n");
      writeFileSync(join(root, "generated", "Helper.ts"), "// <auto-generated>\nexport const helper = 1;\n");
      writeFileSync(join(root, ".code-explorer.json"), "{ invalid");
      const server = createServer({ projectRoot: createNativeProjectRoot(root) });
      const search = await server.call("code_search", { query: "helper" });
      const status = await server.call("code_status", { action: "status" });
      assert.equal("code" in search, false);
      assert.equal("code" in status, false);
      if ("code" in search || "code" in status) throw new Error("expected discovery response");
      assert.deepEqual(
        (search.data.candidates as { path: string }[]).map((candidate) => candidate.path),
        ["src/Helper.ts"],
      );
      assert.equal(status.data.classification_config_invalid, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns native workspace symbols through code_search after classification and filters", async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-server-symbols-"));
    try {
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "tests"));
      mkdirSync(join(root, "generated"));
      writeFileSync(join(root, "src", "main.rs"), "fn helper() {}\n");
      writeFileSync(join(root, "tests", "helper_test.rs"), "fn helper() {}\n");
      writeFileSync(join(root, "generated", "helper.rs"), "// <auto-generated>\nfn helper() {}\n");
      const symbols = [
        symbol("function", "src/main.rs"),
        symbol("class", "src/main.rs"),
        symbol("function", "tests/helper_test.rs"),
        symbol("function", "generated/helper.rs"),
      ];
      const adapter: LanguageAdapter = {
        status: () => ({
          language: "rust",
          backend_name: "test",
          backend_version: "test",
          discovery_source: "injected",
          state: "ready",
          capabilities: {
            definition: { state: "ready" },
            references: { state: "ready" },
            type_definition: { state: "ready" },
            implementation: { state: "ready" },
            callers: { state: "ready" },
            callees: { state: "ready" },
          },
          last_transition_time: 0,
        }),
        request: async () => ({ operation: "search", revision: { generation: 1, manifest_sha256: "test" }, symbols }),
      };
      const server = createServer({ projectRoot: createNativeProjectRoot(root), adapters: [adapter] });
      const result = await server.call("code_search", {
        query: "helper",
        kinds: ["function"],
        path_globs: ["src/**"],
        limit: 1,
      });
      assert.equal("code" in result, false);
      if ("code" in result) throw new Error("expected discovery response");
      assert.deepEqual(
        (result.data.candidates as { identity: string }[]).map((candidate) => candidate.identity),
        ["function:src/main.rs"],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("normalizes Windows-form backend paths in discovery responses", async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-server-windows-path-"));
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src", "Helper.rs"), "fn helper() {}\n");
      const server = createServer({
        projectRoot: createNativeProjectRoot(root),
        adapters: [adapterWithSymbols([symbol("function", "src\\Helper.rs")])],
      });
      const result = await server.call("code_search", { query: "helper" });
      assert.equal("code" in result, false);
      if ("code" in result) throw new Error("expected discovery response");
      assert.ok((result.data.candidates as { path: string }[]).every(({ path }) => path === "src/Helper.rs"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects an out-of-project backend location without exposing its path", async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-server-external-path-"));
    const outside = mkdtempSync(join(tmpdir(), "code-explorer-external-path-"));
    try {
      writeFileSync(join(outside, "Helper.rs"), "fn helper() {}\n");
      const server = createServer({
        projectRoot: createNativeProjectRoot(root),
        adapters: [adapterWithSymbols([symbol("function", join(outside, "Helper.rs"))])],
      });
      const result = await server.call("code_search", { query: "helper" });
      assert.deepEqual(result, {
        schema_version: 1,
        code: "path_outside_project",
        message: "path_outside_project",
        retryable: false,
      });
      assert.equal(JSON.stringify(result).includes(outside), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("removes sensitive adapter symbols before discovery classification, filters, limits, and responses", async () => {
    const root = mkdtempSync(join(tmpdir(), "code-explorer-server-sensitive-symbols-"));
    try {
      const symbols = [
        symbol("function", ".env"),
        symbol("function", ".git/config"),
        symbol("function", "keys\\nested\\key.pem"),
        symbol("function", "src/Helper.rs"),
      ];
      const adapter: LanguageAdapter = {
        status: () => ({
          language: "rust",
          backend_name: "test",
          backend_version: "test",
          discovery_source: "injected",
          state: "ready",
          capabilities: {
            definition: { state: "ready" },
            references: { state: "ready" },
            type_definition: { state: "ready" },
            implementation: { state: "ready" },
            callers: { state: "ready" },
            callees: { state: "ready" },
          },
          last_transition_time: 0,
        }),
        request: async () => ({ operation: "search", revision: { generation: 1, manifest_sha256: "test" }, symbols }),
      };
      const server = createServer({ projectRoot: createNativeProjectRoot(root), adapters: [adapter] });
      const searches = await Promise.all([
        server.call("code_search", { query: "helper", limit: 50 }),
        server.call("code_search", { query: "helper", path_globs: ["**"], limit: 1 }),
        server.call("code_search", { query: "helper", kinds: ["function"], limit: 50 }),
      ]);
      const status = await server.call("code_status", { action: "status" });
      for (const result of [...searches, status]) {
        assert.equal("code" in result, false);
        if ("code" in result) throw new Error("expected discovery response");
        const serialized = JSON.stringify(result);
        assert.doesNotMatch(serialized, /\.env|\.git\/config|key\.pem/iu);
      }
      for (const result of searches) {
        if ("code" in result) throw new Error("expected discovery response");
        assert.deepEqual(
          (result.data.candidates as { path: string }[]).map((candidate) => candidate.path),
          ["src/Helper.rs"],
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function symbol(kind: string, path: string) {
  return {
    id: `${kind}:${path}`,
    name: "helper",
    language: "rust" as const,
    kind,
    location: { path, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } },
  };
}

async function startSession(server: ReturnType<typeof createServer>): Promise<string> {
  const response = await server.call("code_status", { action: "start_session" });
  if ("code" in response || typeof response.data.session_id !== "string") throw new Error("expected session");
  return response.data.session_id;
}

function focusableNavigationAdapter(): LanguageAdapter {
  const focused = symbol("function", "src/helper.rs");
  return {
    status: () => ({
      language: "rust",
      backend_name: "test",
      backend_version: "test",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "unavailable" },
        references: { state: "unavailable" },
        type_definition: { state: "unavailable" },
        implementation: { state: "unavailable" },
        callers: { state: "unavailable" },
        callees: { state: "unavailable" },
      },
      last_transition_time: 0,
    }),
    request: async () => ({
      operation: "focus",
      revision: { generation: 1, manifest_sha256: "test" },
      symbol: focused,
      content: { body: "Target", visible_symbols: [{ name: "Target", symbol_id: "target" }] },
    }),
  };
}

function adapterWithSymbols(symbols: ReturnType<typeof symbol>[]): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "test",
      backend_version: "test",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" },
        references: { state: "ready" },
        type_definition: { state: "ready" },
        implementation: { state: "ready" },
        callers: { state: "ready" },
        callees: { state: "ready" },
      },
      last_transition_time: 0,
    }),
    request: async () => ({ operation: "search", revision: { generation: 1, manifest_sha256: "test" }, symbols }),
  };
}
