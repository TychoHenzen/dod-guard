import assert from "node:assert/strict";
import type { LspProcess } from "../semantic/direct-lsp/direct-lsp.js";
import type { RuntimeLspBackendOptions } from "../semantic/runtime/runtime-lsp-backend.js";
import { createRuntimeLspBackend } from "../semantic/runtime/runtime-lsp-backend.js";
export { degradedCapabilities } from "./direct-lsp-semantic-support.js";

export class Process implements LspProcess {
  readonly events: string[];
  readonly sent: Array<{
    id?: number;
    method?: string;
    params?: unknown;
  }> = [];
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

  write(chunk: Uint8Array): void {
    const message = JSON.parse(
      new TextDecoder().decode(chunk).split("\r\n\r\n")[1] ?? "{}",
    ) as {
      id?: number;
      method?: string;
      params?: unknown;
    };
    this.sent.push(message);
    if (message.method === "initialize") {
      this.respond({
        jsonrpc: "2.0",
        id: message.id,
        result: { capabilities: this.serverCapabilities },
      });
    }
    if (message.method === "shutdown" && !this.ignoreShutdown)
      this.respond({
        jsonrpc: "2.0",
        id: message.id,
        result: null,
      });
    if (message.method === "exit" && !this.ignoreExit) {
      this.events.push("exit");
      for (const listener of this.exit) listener();
    }
    if (
      message.id !== undefined &&
      message.method &&
      this.responseFor &&
      message.method !== "initialize"
    ) {
      this.respond({
        jsonrpc: "2.0",
        id: message.id,
        result: this.responseFor(message.method, message.params),
      });
    }
  }

  onStdout(listener: (chunk: Uint8Array) => void): void {
    this.stdout.push(listener);
  }

  onExit(listener: () => void): void {
    this.exit.push(listener);
  }

  onError(listener: () => void): void {
    this.errors.push(listener);
  }

  kill(): void {
    this.events.push("kill");
    for (const listener of this.exit) listener();
  }

  error(): void {
    for (const listener of this.errors) listener();
  }

  private respond(value: unknown): void {
    const body = JSON.stringify(value);
    const frame = new TextEncoder().encode(
      `Content-Length: ${body.length}\r\n\r\n${body}`,
    );
    for (const listener of this.stdout) listener(frame);
  }
}

export class Scheduler {
  private tasks: (() => void)[] = [];
  private readonly time = 0;
  now = () => this.time;

  setTimeout(callback: () => void): () => void {
    this.tasks.push(callback);
    return callback;
  }

  clearTimeout(handle: unknown): void {
    this.tasks = this.tasks.filter((task) => task !== handle);
  }

  run(): void {
    const tasks = this.tasks;
    this.tasks = [];
    for (const task of tasks) task();
  }
}

export const runtimeRoot = {
  canonicalPath: "/project",
  resolveClientPath: () => "/project/a.rs",
  classifyBackendPath: () => ({ relative_path: "a.rs" }),
  openProtected: () => ({
    path: "/project/a.rs",
    handle: undefined,
  }),
  protectedRead: () => ({
    path: "/project/a.rs",
    bytes: "",
  }),
} as never;

export const unavailableCapabilities = {
  definition: { state: "unavailable" },
  references: { state: "unavailable" },
  type_definition: { state: "unavailable" },
  implementation: { state: "unavailable" },
  callers: { state: "unavailable" },
  callees: { state: "unavailable" },
} as never;

function readyPreparation() {
  return {
    status: "ready" as const,
    executable: "server",
    version: "test",
    arguments: [],
    shell: false as const,
    environment: {},
    endpoint: "stdio" as const,
    safe_initialization_options: {},
  };
}

export function runtimeOptions(
  process: LspProcess,
  overrides: Partial<RuntimeLspBackendOptions> = {},
): RuntimeLspBackendOptions {
  return {
    language: "rust",
    root: runtimeRoot,
    root_uri: "file:///project",
    revision: { generation: 0, manifest_sha256: "x" },
    symbols: new Map(),
    capabilities: unavailableCapabilities,
    toBackendUri: () => "file:///project/a.rs",
    fromBackendUri: () => "a.rs",
    prepare: readyPreparation,
    confirmInitialized: () => ({ status: "ready" }),
    spawn: () => process,
    ...overrides,
  };
}

export function degradedProcess(): Process {
  return new Process(
    [],
    { definitionProvider: true, referencesProvider: true },
    (method) =>
      method === "textDocument/definition"
        ? [
            {
              uri: "git:/virtual",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
            },
          ]
        : [
            {
              uri: "file:///project/a.rs",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
            },
          ],
  );
}

export function pythonMirrorOptions(
  process: LspProcess,
): RuntimeLspBackendOptions {
  return runtimeOptions(process, {
    language: "python",
    root: {
      canonicalPath: "/project",
      revalidate: () => "ready",
      resolveClientPath: () => "/project/a.py",
      classifyBackendPath: () => ({
        relative_path: "a.py",
      }),
      openProtected: () => ({
        path: "/project/a.py",
        handle: undefined,
      }),
      protectedRead: () => ({
        path: "/project/a.py",
        bytes: "def helper():\n    pass\n",
      }),
    } as never,
    root_uri: "file:///mirror",
    capabilities: unavailableCapabilities,
    initial_document_paths: ["a.py"],
    toBackendUri: () => "file:///mirror/a.py",
    fromBackendUri: () => "a.py",
  });
}

export function runtimeEntrySymbol() {
  return {
    id: "entry",
    name: "helper",
    language: "rust" as const,
    kind: "function" as const,
    location: {
      path: "a.rs",
      range: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 13 },
      },
    },
  };
}

export function runtimeSourceOptions(
  process: LspProcess,
  overrides: Partial<RuntimeLspBackendOptions> = {},
): RuntimeLspBackendOptions {
  return runtimeOptions(process, {
    root: {
      canonicalPath: "/project",
      resolveClientPath: () => "/project/a.rs",
      classifyBackendPath: () => ({
        relative_path: "a.rs",
      }),
      openProtected: () => ({
        path: "/project/a.rs",
        handle: undefined,
      }),
      protectedRead: () => ({
        path: "/project/a.rs",
        bytes: "pub fn helper() {}\n",
      }),
    } as never,
    symbols: new Map([["entry", runtimeEntrySymbol()]]),
    ...overrides,
  });
}

export function assertSourceDocumentOpened(process: Process): void {
  assert.deepEqual(
    process.sent
      .filter((message) => message.method?.startsWith("textDocument/"))
      .map((message) => message),
    [
      {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: "file:///project/a.rs",
            languageId: "rust",
            version: 0,
            text: "pub fn helper() {}\n",
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/definition",
        params: {
          textDocument: { uri: "file:///project/a.rs" },
          position: { line: 0, character: 7 },
        },
      },
    ],
  );
}

export function assertReplacementDocuments(
  first: Process,
  replacement: Process,
): void {
  const countDidOpen = (process: Process) =>
    process.sent.filter((message) => message.method === "textDocument/didOpen")
      .length;
  assert.equal(countDidOpen(first), 1);
  assert.equal(countDidOpen(replacement), 1);
  const methods = replacement.sent
    .filter((message) => message.method?.startsWith("textDocument/"))
    .map((message) => message.method);
  assert.deepEqual(methods, [
    "textDocument/didOpen",
    "textDocument/definition",
    "textDocument/definition",
  ]);
}

export function policyFailureOptions(onPrepare: () => void) {
  return {
    prepare: () => {
      onPrepare();
      return readyPreparation();
    },
    confirmInitialized: () => ({
      status: "unavailable" as const,
      code: "backend_identity_changed" as const,
      terminate: true as const,
    }),
  };
}

export function restartingSourceFixture() {
  const responseFor = (method: string) =>
    method === "textDocument/definition"
      ? [
          {
            uri: "file:///project/a.rs",
            range: {
              start: { line: 0, character: 7 },
              end: { line: 0, character: 13 },
            },
          },
        ]
      : [];
  const first = new Process([], { definitionProvider: true }, responseFor);
  const replacement = new Process(
    [],
    { definitionProvider: true },
    responseFor,
  );
  const scheduler = new Scheduler();
  const processes = [first, replacement];
  const backend = createRuntimeLspBackend(
    runtimeSourceOptions(first, {
      spawn: () => processes.shift() as Process,
      scheduler,
    }),
  );
  return { backend, first, replacement, scheduler };
}
