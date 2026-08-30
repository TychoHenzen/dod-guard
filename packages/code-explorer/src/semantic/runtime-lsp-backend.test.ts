import assert from "node:assert/strict";
import { it } from "node:test";
import type { LspProcess } from "./direct-lsp.js";
import { createRustAdapter } from "./language-adapter.js";
import { createRuntimeLspBackend } from "./runtime-lsp-backend.js";

class Process implements LspProcess {
  readonly events: string[];
  private stdout: ((chunk: Uint8Array) => void)[] = [];
  private exit: (() => void)[] = [];
  private errors: (() => void)[] = [];
  ignoreShutdown = false;
  ignoreExit = false;
  constructor(
    events: string[],
    private readonly serverCapabilities: Record<string, unknown> = {},
    private readonly responseFor?: (method: string, params: unknown) => unknown,
  ) {
    this.events = events;
  }
  write(chunk: Uint8Array) {
    const message = JSON.parse(new TextDecoder().decode(chunk).split("\r\n\r\n")[1] ?? "{}") as {
      id?: number;
      method?: string;
      params?: unknown;
    };
    if (message.method === "initialize")
      this.respond({ jsonrpc: "2.0", id: message.id, result: { capabilities: this.serverCapabilities } });
    if (message.method === "shutdown" && !this.ignoreShutdown)
      this.respond({ jsonrpc: "2.0", id: message.id, result: null });
    if (message.method === "exit" && !this.ignoreExit) {
      this.events.push("exit");
      for (const listener of this.exit) listener();
    }
    if (message.id !== undefined && message.method && this.responseFor && message.method !== "initialize") {
      this.respond({ jsonrpc: "2.0", id: message.id, result: this.responseFor(message.method, message.params) });
    }
  }
  onStdout(listener: (chunk: Uint8Array) => void) {
    this.stdout.push(listener);
  }
  onExit(listener: () => void) {
    this.exit.push(listener);
  }
  onError(listener: () => void) {
    this.errors.push(listener);
  }
  kill() {
    this.events.push("kill");
    for (const listener of this.exit) listener();
  }
  error() {
    for (const listener of this.errors) listener();
  }
  private respond(value: unknown) {
    const body = JSON.stringify(value);
    const frame = new TextEncoder().encode(`Content-Length: ${body.length}\r\n\r\n${body}`);
    for (const listener of this.stdout) listener(frame);
  }
}

class Scheduler {
  private tasks: (() => void)[] = [];
  now = () => 0;
  setTimeout(callback: () => void) {
    this.tasks.push(callback);
    return callback;
  }
  clearTimeout(handle: unknown) {
    this.tasks = this.tasks.filter((task) => task !== handle);
  }
  run() {
    const tasks = this.tasks;
    this.tasks = [];
    for (const task of tasks) task();
  }
}

const root = {
  canonicalPath: "/project",
  resolveClientPath: () => "/project/a.rs",
  classifyBackendPath: () => ({ relative_path: "a.rs" }),
  openProtected: () => ({ path: "/project/a.rs", handle: undefined }),
  protectedRead: () => ({ path: "/project/a.rs", bytes: "" }),
} as never;
const capabilities = {
  definition: { state: "unavailable" },
  references: { state: "unavailable" },
  type_definition: { state: "unavailable" },
  implementation: { state: "unavailable" },
  callers: { state: "unavailable" },
  callees: { state: "unavailable" },
} as never;

it("confirms identity before publishing and disposes only after child exit", async () => {
  const events: string[] = [];
  const process = new Process(events);
  const backend = createRuntimeLspBackend({
    language: "rust",
    root,
    root_uri: "file:///project",
    revision: { generation: 0, manifest_sha256: "x" },
    symbols: new Map(),
    capabilities,
    safe_initialization_options: {},
    toBackendUri: () => "file:///project/a.rs",
    fromBackendUri: () => "a.rs",
    prepare: () => ({ status: "ready", executable: "server", arguments: [], environment: {} }),
    confirmInitialized: () => ({ status: "ready" }),
    spawn: () => process,
    dispose: () => events.push("dispose"),
  });
  await backend.start?.();
  await backend.shutdown?.();
  assert.deepEqual(events, ["exit", "dispose"]);
});

it("preserves post-initialize policy failure code", async () => {
  const process = new Process([]);
  let prepares = 0;
  const backend = createRuntimeLspBackend({
    language: "rust",
    root,
    root_uri: "file:///project",
    revision: { generation: 0, manifest_sha256: "x" },
    symbols: new Map(),
    capabilities,
    safe_initialization_options: {},
    toBackendUri: () => "file:///project/a.rs",
    fromBackendUri: () => "a.rs",
    prepare: () => {
      prepares += 1;
      return { status: "ready", executable: "server", arguments: [], environment: {} };
    },
    confirmInitialized: () => ({ status: "unavailable", code: "backend_identity_changed", terminate: true }),
    spawn: () => process,
  });
  if (!backend.start) throw new Error("expected start");
  await assert.rejects(backend.start(), /backend_identity_changed/);
  assert.deepEqual(backend.readiness(), { state: "unavailable", failure_code: "backend_identity_changed" });
  const adapter = createRustAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    unavailable_failure_code: "backend_unavailable",
  });
  assert.equal(adapter.status().failure_code, "backend_identity_changed");
  await assert.rejects(backend.start(), /backend_identity_changed/);
  assert.equal(prepares, 1);
  if (!backend.refresh) throw new Error("expected refresh");
  await assert.rejects(backend.refresh(), /backend_identity_changed/);
  assert.equal(prepares, 2);
});

it("publishes a relation-level degraded status from the runtime semantic backend", async () => {
  const process = new Process([], { definitionProvider: true, referencesProvider: true }, (method) =>
    method === "textDocument/definition"
      ? [{ uri: "git:/virtual", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }]
      : [{ uri: "file:///project/a.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }],
  );
  const backend = createRuntimeLspBackend({
    language: "rust",
    root,
    root_uri: "file:///project",
    revision: { generation: 0, manifest_sha256: "x" },
    symbols: new Map([
      [
        "entry",
        {
          id: "entry",
          name: "entry",
          language: "rust",
          kind: "function",
          location: { path: "a.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } },
        },
      ],
    ]),
    capabilities,
    safe_initialization_options: {},
    toBackendUri: () => "file:///project/a.rs",
    fromBackendUri: (uri) => (uri === "file:///project/a.rs" ? "a.rs" : undefined),
    prepare: () => ({ status: "ready", executable: "server", arguments: [], environment: {} }),
    confirmInitialized: () => ({ status: "ready" }),
    spawn: () => process,
  });
  await assert.rejects(backend.query({ operation: "definition", symbol_id: "entry" }), /invalid_backend_result/);
  assert.deepEqual(backend.readiness(), { state: "degraded" });
  assert.deepEqual(backend.capabilities?.(), {
    definition: { state: "unavailable" },
    references: { state: "ready" },
    type_definition: { state: "unavailable" },
    implementation: { state: "unavailable" },
    callers: { state: "unavailable" },
    callees: { state: "unavailable" },
  });
  const references = await backend.query({ operation: "references", symbol_id: "entry" });
  assert.equal(references.operation, "references");
});

it("force-kills an ignored shutdown before disposing once", async () => {
  const events: string[] = [];
  const process = new Process(events);
  process.ignoreShutdown = true;
  process.ignoreExit = true;
  const scheduler = new Scheduler();
  const backend = createRuntimeLspBackend({
    language: "rust",
    root,
    root_uri: "file:///project",
    revision: { generation: 0, manifest_sha256: "x" },
    symbols: new Map(),
    capabilities,
    safe_initialization_options: {},
    toBackendUri: () => "file:///project/a.rs",
    fromBackendUri: () => "a.rs",
    prepare: () => ({ status: "ready", executable: "server", arguments: [], environment: {} }),
    confirmInitialized: () => ({ status: "ready" }),
    spawn: () => process,
    scheduler,
    dispose: () => events.push("dispose"),
  });
  await backend.start?.();
  const shutdown = backend.shutdown?.();
  scheduler.run();
  await Promise.resolve();
  scheduler.run();
  await shutdown;
  assert.deepEqual(events, ["kill", "dispose"]);
});

it("settles a child error without double disposal", async () => {
  const events: string[] = [];
  const process = new Process(events);
  const backend = createRuntimeLspBackend({
    language: "rust",
    root,
    root_uri: "file:///project",
    revision: { generation: 0, manifest_sha256: "x" },
    symbols: new Map(),
    capabilities,
    safe_initialization_options: {},
    toBackendUri: () => "file:///project/a.rs",
    fromBackendUri: () => "a.rs",
    prepare: () => ({ status: "ready", executable: "server", arguments: [], environment: {} }),
    confirmInitialized: () => ({ status: "ready" }),
    spawn: () => process,
    dispose: () => events.push("dispose"),
  });
  await backend.start?.();
  process.error();
  await backend.shutdown?.();
  await backend.shutdown?.();
  assert.deepEqual(events, ["kill", "dispose"]);
});
