import assert from "node:assert/strict";
import { it } from "node:test";
import { createDirectLspSemanticBackend } from "./direct-lsp-semantic.js";
import type { ProjectRoot } from "./project-root.js";

const root: ProjectRoot = {
  canonicalPath: "/project",
  revalidate: () => "ready",
  resolveClientPath: (path) => `/project/${path}`,
  classifyBackendPath: (path) => (path.startsWith("/project/") ? { relative_path: path.slice(9) } : { external: true }),
  openProtected: () => ({ path: "/project/src/main.rs", handle: undefined }),
  protectedRead: () => ({ path: "/project/src/main.rs", bytes: "fn main() {}\n" }),
};

it("maps definition and references through protected semantic validation", async () => {
  const methods: string[] = [];
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map([
      [
        "entry",
        {
          id: "entry",
          name: "main",
          language: "rust",
          kind: "function",
          location: {
            path: "src/main.rs",
            range: { start: { line: 0, character: 3 }, end: { line: 0, character: 7 } },
          },
        },
      ],
    ]),
    capabilities: Object.fromEntries(
      ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
        name,
        { state: "ready" },
      ]),
    ) as never,
    client: {
      status: () => ({
        state: "ready",
        events: [],
        restart_delays_ms: [],
        server_capabilities: { definitionProvider: true, referencesProvider: true },
      }),
      request: async (method) => {
        methods.push(method);
        return {
          uri: "file:///project/src/main.rs",
          range: { start: { line: 0, character: 3 }, end: { line: 0, character: 7 } },
        };
      },
    },
    toBackendUri: (location) => `file:///project/${location.path}`,
    fromBackendUri: (uri) => (uri === "file:///project/src/main.rs" ? "src/main.rs" : undefined),
  });

  const definition = await backend.query({ operation: "definition", symbol_id: "entry" });
  const references = await backend.query({ operation: "references", symbol_id: "entry" });
  assert.equal(definition.operation, "definition");
  assert.equal(references.operation, "references");
  assert.deepEqual(methods, ["textDocument/definition", "textDocument/references"]);
});

it("delegates protected source opening to the epoch-aware client before navigation", async () => {
  const opened: Array<{ uri: string; content: unknown }> = [];
  const source = {
    id: "entry",
    name: "main",
    language: "rust" as const,
    kind: "function",
    location: { path: "src/main.rs", range: { start: { line: 0, character: 3 }, end: { line: 0, character: 7 } } },
  };
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map([[source.id, source]]),
    capabilities: {} as never,
    client: {
      status: () => ({
        state: "ready",
        events: [],
        restart_delays_ms: [],
        server_capabilities: { definitionProvider: true },
      }),
      openProtectedDocument: (uri, content) => opened.push({ uri, content }),
      request: async () => [],
    },
    toBackendUri: () => "file:///project/src/main.rs",
    fromBackendUri: () => "src/main.rs",
  });
  await backend.query({ operation: "definition", symbol_id: source.id });
  await backend.query({ operation: "definition", symbol_id: source.id });
  assert.deepEqual(opened, [
    { uri: "file:///project/src/main.rs", content: { language_id: "rust", bytes: "fn main() {}\n" } },
    { uri: "file:///project/src/main.rs", content: { language_id: "rust", bytes: "fn main() {}\n" } },
  ]);
});

it("preserves public workspace-symbol names and kinds for discovery filters", async () => {
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map(),
    capabilities: {} as never,
    client: {
      status: () => ({ state: "ready", events: [], restart_delays_ms: [] }),
      request: async () => [
        {
          name: "helper",
          kind: 12,
          location: {
            uri: "file:///project/src/main.rs",
            range: { start: { line: 0, character: 3 }, end: { line: 0, character: 9 } },
          },
        },
      ],
    },
    toBackendUri: () => "file:///project/src/main.rs",
    fromBackendUri: (uri) => (uri === "file:///project/src/main.rs" ? "src/main.rs" : undefined),
  });
  const result = await backend.query({ operation: "search", query: "helper" });
  if (result.operation !== "search") throw new Error("expected search result");
  assert.deepEqual(
    result.symbols.map(({ name, kind, location }) => ({ name, kind, path: location.path })),
    [{ name: "helper", kind: "function", path: "src/main.rs" }],
  );
});

it("does not send a relation request that initialize reported unavailable", async () => {
  const methods: string[] = [];
  const source = {
    id: "entry",
    name: "main",
    language: "python" as const,
    kind: "function",
    location: { path: "src/main.py", range: { start: { line: 0, character: 4 }, end: { line: 0, character: 8 } } },
  };
  const backend = createDirectLspSemanticBackend({
    language: "python",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map([[source.id, source]]),
    capabilities: {} as never,
    client: {
      status: () => ({
        state: "ready",
        events: [],
        restart_delays_ms: [],
        server_capabilities: { definitionProvider: true, implementationProvider: false },
      }),
      request: async (method) => {
        methods.push(method);
        return [];
      },
    },
    toBackendUri: () => "file:///project/src/main.py",
    fromBackendUri: () => "src/main.py",
  });

  await assert.rejects(backend.query({ operation: "implementation", symbol_id: source.id }), /backend_unavailable/);
  assert.deepEqual(methods, []);
});

it("does not retain a backend URI outside the protected project root", async () => {
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map(),
    capabilities: Object.fromEntries(
      ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
        name,
        { state: "ready" },
      ]),
    ) as never,
    client: { status: () => ({ state: "ready", events: [], restart_delays_ms: [] }), request: async () => [] },
    toBackendUri: () => "file:///project/src/main.rs",
    fromBackendUri: () => undefined,
  });
  const result = await backend.query({ operation: "search", query: "main" });
  assert.deepEqual(result, {
    operation: "search",
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: [],
  });
});

it("uses server-issued hierarchy items and preserves target metadata with call-site ranges", async () => {
  const methods: string[] = [];
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map([
      [
        "entry",
        {
          id: "entry",
          name: "entry",
          language: "rust",
          kind: "function",
          location: {
            path: "src/main.rs",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          },
        },
      ],
    ]),
    capabilities: Object.fromEntries(
      ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
        name,
        { state: "ready" },
      ]),
    ) as never,
    client: {
      status: () => ({
        state: "ready",
        events: [],
        restart_delays_ms: [],
        server_capabilities: { callHierarchyProvider: true },
      }),
      request: async (method) => {
        methods.push(method);
        return method === "textDocument/prepareCallHierarchy"
          ? [
              {
                name: "entry",
                kind: 12,
                uri: "file:///project/src/main.rs",
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
              },
            ]
          : [
              {
                from: {
                  name: "caller",
                  kind: 12,
                  uri: "file:///project/src/main.rs",
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
                },
                fromRanges: [{ start: { line: 0, character: 2 }, end: { line: 0, character: 4 } }],
              },
            ];
      },
    },
    toBackendUri: (location) => `file:///project/${location.path}`,
    fromBackendUri: (uri) => (uri === "file:///project/src/main.rs" ? "src/main.rs" : undefined),
  });
  const result = await backend.query({ operation: "callers", symbol_id: "entry" });
  assert.deepEqual(methods, ["textDocument/prepareCallHierarchy", "callHierarchy/incomingCalls"]);
  assert.equal(result.operation, "callers");
  if (result.operation !== "callers") throw new Error("expected callers");
  const caller = result.relations[0];
  if (!(caller && "symbol" in caller)) throw new Error("expected local caller");
  assert.equal(caller.symbol.name, "caller");
  assert.equal((caller.location as { range: { start: { character: number } } }).range.start.character, 2);
});

it("uses outgoing hierarchy targets and rejects virtual or malformed locations", async () => {
  const methods: string[] = [];
  const source = {
    id: "entry",
    name: "entry",
    language: "rust" as const,
    kind: "function",
    location: { path: "src/main.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
  };
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map([["entry", source]]),
    capabilities: Object.fromEntries(
      ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
        name,
        { state: "ready" },
      ]),
    ) as never,
    client: {
      status: () => ({
        state: "ready",
        events: [],
        restart_delays_ms: [],
        server_capabilities: { callHierarchyProvider: true },
      }),
      request: async (method) => {
        methods.push(method);
        return method === "textDocument/prepareCallHierarchy"
          ? [{ name: "entry" }]
          : [
              {
                to: {
                  name: "callee",
                  kind: 6,
                  uri: "file:///project/src/main.rs",
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
                },
                fromRanges: [{ start: { line: 0, character: 3 }, end: { line: 0, character: 5 } }],
              },
            ];
      },
    },
    toBackendUri: (location) => `file:///project/${location.path}`,
    fromBackendUri: (uri) => (uri === "file:///project/src/main.rs" ? "src/main.rs" : undefined),
  });
  const result = await backend.query({ operation: "callees", symbol_id: "entry" });
  assert.deepEqual(methods, ["textDocument/prepareCallHierarchy", "callHierarchy/outgoingCalls"]);
  if (result.operation !== "callees") throw new Error("expected callees");
  const callee = result.relations[0];
  if (!(callee && "symbol" in callee)) throw new Error("expected local callee");
  assert.equal(callee.symbol.name, "callee");
  assert.equal((callee.location as { range: { start: { character: number } } }).range.start.character, 3);
});

it("rejects virtual backend locations instead of relabeling them external", async () => {
  const source = {
    id: "entry",
    name: "entry",
    language: "rust" as const,
    kind: "function",
    location: { path: "src/main.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
  };
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map([["entry", source]]),
    capabilities: Object.fromEntries(
      ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
        name,
        { state: "ready" },
      ]),
    ) as never,
    client: {
      status: () => ({
        state: "ready",
        events: [],
        restart_delays_ms: [],
        server_capabilities: { definitionProvider: true, referencesProvider: true },
      }),
      request: async (method) =>
        method === "textDocument/definition"
          ? [{ uri: "git:/virtual", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }]
          : [
              {
                uri: "file:///project/src/main.rs",
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              },
            ],
    },
    toBackendUri: () => "file:///project/src/main.rs",
    fromBackendUri: () => undefined,
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

it("returns a redacted external relation for an external file URI", async () => {
  const source = {
    id: "entry",
    name: "entry",
    language: "rust" as const,
    kind: "function",
    location: { path: "src/main.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
  };
  const backend = createDirectLspSemanticBackend({
    language: "rust",
    root,
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: new Map([["entry", source]]),
    capabilities: Object.fromEntries(
      ["definition", "references", "type_definition", "implementation", "callers", "callees"].map((name) => [
        name,
        { state: "ready" },
      ]),
    ) as never,
    client: {
      status: () => ({
        state: "ready",
        events: [],
        restart_delays_ms: [],
        server_capabilities: { definitionProvider: true },
      }),
      request: async () => [
        { uri: "file:///outside/lib.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
      ],
    },
    toBackendUri: (location) => `file:///project/${location.path}`,
    fromBackendUri: () => undefined,
  });
  const result = await backend.query({ operation: "definition", symbol_id: "entry" });
  if (result.operation !== "definition") throw new Error("expected definition");
  assert.deepEqual(result.relations, [{ relation: "definition", external: { external: true } }]);
});
