import assert from "node:assert/strict";
import type {
  ProjectRevision,
  RelationCapabilities,
  SymbolIdentity,
} from "../semantic/contract.js";
import type {
  DirectLspStatus,
  ProtectedDocumentContent,
} from "../semantic/direct-lsp.js";
import { createDirectLspSemanticBackend } from "../semantic/direct-lsp-semantic.js";
import type { DirectLspSemanticOptions } from "../semantic/direct-lsp-semantic-options.js";
import type { ProjectRoot } from "../semantic/project-root.js";

export const semanticRoot: ProjectRoot = {
  canonicalPath: "/project",
  revalidate: () => "ready",
  resolveClientPath: (path) => `/project/${path}`,
  classifyBackendPath: (path) =>
    path.startsWith("/project/")
      ? { relative_path: path.slice(9) }
      : { external: true },
  openProtected: () => ({
    path: "/project/src/main.rs",
    handle: undefined,
  }),
  protectedRead: () => ({
    path: "/project/src/main.rs",
    bytes: "fn main() {}\n",
  }),
};

export function semanticRootWithRead(path: string, bytes: string): ProjectRoot {
  return {
    ...semanticRoot,
    protectedRead: () => ({ path, bytes }),
  };
}

export function projectBackendPath(uri: string): string | undefined {
  return uri.startsWith("file:///project/")
    ? uri.slice("file:///project/".length)
    : undefined;
}

export function workspaceSearchClient(methods: string[]) {
  return semanticClient(async (method: string) => {
    methods.push(method);
    return method === "workspace/symbol"
      ? [
          {
            name: "helper",
            kind: 12,
            location: {
              uri: "file:///project/src/main.rs",
              range: {
                start: { line: 0, character: 3 },
                end: { line: 0, character: 9 },
              },
            },
          },
        ]
      : [];
  });
}

export function pythonDocumentSymbolClient(methods: string[]) {
  return semanticClient(async (method: string) => {
    methods.push(method);
    return method === "textDocument/documentSymbol"
      ? [
          {
            name: "helper",
            kind: 12,
            range: {
              start: { line: 3, character: 0 },
              end: { line: 4, character: 8 },
            },
            selectionRange: {
              start: { line: 3, character: 4 },
              end: { line: 3, character: 10 },
            },
          },
        ]
      : [];
  });
}

export function incomingHierarchyClient(methods: string[]) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      return method === "textDocument/prepareCallHierarchy"
        ? [
            {
              name: "entry",
              kind: 12,
              uri: "file:///project/src/main.rs",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 },
              },
            },
          ]
        : [
            {
              from: {
                name: "caller",
                kind: 12,
                uri: "file:///project/src/main.rs",
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 6 },
                },
              },
              fromRanges: [
                {
                  start: { line: 0, character: 2 },
                  end: { line: 0, character: 4 },
                },
              ],
            },
          ];
    },
    { callHierarchyProvider: true },
  );
}

export function outgoingHierarchyClient(methods: string[]) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      return method === "textDocument/prepareCallHierarchy"
        ? [{ name: "entry" }]
        : [
            {
              to: {
                name: "callee",
                kind: 6,
                uri: "file:///project/src/main.rs",
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 6 },
                },
              },
              fromRanges: [
                {
                  start: { line: 0, character: 3 },
                  end: { line: 0, character: 5 },
                },
              ],
            },
          ];
    },
    { callHierarchyProvider: true },
  );
}

export function mainRustSymbol() {
  return {
    id: "entry",
    name: "main",
    language: "rust" as const,
    kind: "function" as const,
    location: {
      path: "src/main.rs",
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 7 },
      },
    },
  };
}

export function locationClient(
  methods: string[],
  openProtectedDocument?: (
    uri: string,
    content: ProtectedDocumentContent,
  ) => void,
) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      return {
        uri: "file:///project/src/main.rs",
        range: {
          start: { line: 0, character: 3 },
          end: { line: 0, character: 7 },
        },
      };
    },
    { definitionProvider: true, referencesProvider: true },
    openProtectedDocument,
  );
}

export function virtualLocationClient() {
  return semanticClient(
    async (method: string) =>
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
              uri: "file:///project/src/main.rs",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
            },
          ],
    { definitionProvider: true, referencesProvider: true },
  );
}

export function pythonDiscoverySymbol(index: number) {
  return {
    id: `python:src/main.py:${index}`,
    name: "helper",
    language: "python" as const,
    kind: "function" as const,
    location: {
      path: "src/main.py",
      range: {
        start: { line: 3, character: 4 },
        end: { line: 3, character: 10 },
      },
    },
  };
}

export function csharpDiscoverySymbol() {
  return {
    id: "csharp:src/Demo.cs:2",
    name: "Helper",
    language: "csharp" as const,
    kind: "method" as const,
    location: {
      path: "src/Demo.cs",
      range: {
        start: { line: 2, character: 24 },
        end: { line: 2, character: 30 },
      },
    },
  };
}

export function pythonOpenedDiscoveryBackend(methods: string[]) {
  return createSemanticBackend({
    language: "python",
    root: semanticRootWithRead(
      "/project/src/main.py",
      "def entry():\n    pass\n\ndef helper():\n    pass\n",
    ),
    discovery_document_paths: ["src/main.py"],
    client: pythonDocumentSymbolClient(methods),
    fromBackendUri: projectBackendPath,
  });
}

export function pythonServerPathDiscoveryBackend() {
  return createSemanticBackend({
    language: "python",
    root: semanticRootWithRead(
      "/project/src/main.py",
      "def entry():\n    pass\n\ndef helper():\n    pass\n",
    ),
    discovery_document_paths: ["src/main.py"],
    client: semanticClient(),
    fromBackendUri: projectBackendPath,
  });
}

export function csharpServerPathDiscoveryBackend() {
  const source =
    "class Demo {\n    public void Entry() {        Helper(); }\n    private static void Helper() { }\n}\n";
  return createSemanticBackend({
    language: "csharp",
    root: semanticRootWithRead("/project/src/Demo.cs", source),
    discovery_document_paths: ["src/Demo.cs"],
    client: semanticClient(),
    fromBackendUri: projectBackendPath,
  });
}

export function unavailableRelationBackend(methods: string[]) {
  const source = {
    id: "entry",
    name: "main",
    language: "python" as const,
    kind: "function" as const,
    location: {
      path: "src/main.py",
      range: {
        start: { line: 0, character: 4 },
        end: { line: 0, character: 8 },
      },
    },
  };
  return createSemanticBackend({
    language: "python",
    symbols: new Map([[source.id, source]]),
    capabilities: {} as never,
    client: semanticClient(
      async (method) => {
        methods.push(method);
        return [];
      },
      {
        definitionProvider: true,
        implementationProvider: false,
      },
    ),
    fromBackendUri: () => "src/main.py",
  });
}

export function externalLocationClient() {
  return semanticClient(
    async () => [
      {
        uri: "file:///outside/lib.rs",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      },
    ],
    { definitionProvider: true },
  );
}

export function assertHierarchyRelation(
  result: unknown,
  operation: "callers" | "callees",
  name: string,
  callSiteCharacter: number,
): void {
  const output = result as { operation: string; relations: unknown[] };
  assert.equal(output.operation, operation);
  const relation = output.relations[0] as {
    symbol?: { name: string };
    location?: { range: { start: { character: number } } };
    call_site?: { range: { start: { character: number } } };
  };
  assert.ok(relation?.symbol);
  assert.equal(relation.symbol.name, name);
  assert.equal(relation.location?.range.start.character, 0);
  assert.equal(relation.call_site?.range.start.character, callSiteCharacter);
}

export function assertOpenedTwice(
  opened: Array<{ uri: string; content: unknown }>,
): void {
  assert.deepEqual(opened, [
    {
      uri: "file:///project/src/main.rs",
      content: { language_id: "rust", bytes: "fn main() {}\n" },
    },
    {
      uri: "file:///project/src/main.rs",
      content: { language_id: "rust", bytes: "fn main() {}\n" },
    },
  ]);
}

export function readyCapabilities(): RelationCapabilities {
  return Object.fromEntries(
    [
      "definition",
      "references",
      "type_definition",
      "implementation",
      "callers",
      "callees",
    ].map((name) => [name, { state: "ready" }]),
  ) as RelationCapabilities;
}

export const degradedCapabilities = {
  definition: { state: "unavailable" },
  references: { state: "ready" },
  type_definition: { state: "unavailable" },
  implementation: { state: "unavailable" },
  callers: { state: "unavailable" },
  callees: { state: "unavailable" },
} as never;

export function createSemanticBackend(
  overrides: Partial<DirectLspSemanticOptions> = {},
) {
  return createDirectLspSemanticBackend({
    language: "rust",
    root: semanticRoot,
    revision: fixtureRevision(),
    symbols: new Map(),
    capabilities: readyCapabilities(),
    client: defaultClient(),
    toBackendUri: (location) => `file:///project/${location.path}`,
    fromBackendUri: (uri) =>
      uri.startsWith("file:///project/")
        ? uri.slice("file:///project/".length)
        : undefined,
    ...overrides,
  });
}

export function semanticClient(
  request: (
    method: string,
    params: unknown,
  ) => unknown | Promise<unknown> = () => [],
  serverCapabilities: Record<string, unknown> = {},
  openProtectedDocument?: (
    uri: string,
    content: ProtectedDocumentContent,
  ) => void,
) {
  return {
    status: () => ({
      state: "ready" as const,
      events: [],
      restart_delays_ms: [],
      server_capabilities: serverCapabilities,
    }),
    request: (method: string, params: unknown) =>
      Promise.resolve(request(method, params)),
    ...(openProtectedDocument ? { openProtectedDocument } : {}),
  };
}

export function rustEntrySymbol(): SymbolIdentity {
  return {
    id: "entry",
    name: "entry",
    language: "rust",
    kind: "function",
    location: {
      path: "src/main.rs",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
    },
  };
}

function fixtureRevision(): ProjectRevision {
  return { generation: 0, manifest_sha256: "fixture" };
}

function defaultClient(): {
  status: () => DirectLspStatus;
  request: (method: string, params: unknown) => Promise<unknown>;
  openProtectedDocument?: (
    uri: string,
    content: ProtectedDocumentContent,
  ) => void;
} {
  return {
    status: () => ({
      state: "ready",
      events: [],
      restart_delays_ms: [],
      server_capabilities: {},
    }),
    request: async () => [],
  };
}
