import type { DirectLspSemanticOptions } from "../semantic/direct-lsp/direct-lsp-semantic-options.js";
import { createDirectLspSemanticBackend } from "../semantic/direct-lsp/direct-lsp-semantic.js";
import { defaultClient, semanticClient } from "./direct-lsp-semantic-client.js";
import { readyCapabilities } from "./direct-lsp-semantic-capabilities.js";
import { fixtureRevision, semanticRoot } from "./direct-lsp-semantic-root.js";

export function createSemanticBackend(overrides: Partial<DirectLspSemanticOptions> = {}) {
  return createDirectLspSemanticBackend({
    language: "rust",
    root: semanticRoot,
    revision: fixtureRevision(),
    symbols: new Map(),
    capabilities: readyCapabilities(),
    client: defaultClient(),
    toBackendUri: (location) => `file:///project/${location.path}`,
    fromBackendUri: (uri) => (uri.startsWith("file:///project/") ? uri.slice("file:///project/".length) : undefined),
    ...overrides,
  });
}

export function unavailableRelationBackend(methods: string[]) {
  const source = {
    id: "entry",
    name: "main",
    language: "python" as const,
    kind: "function" as const,
    location: { path: "src/main.py", range: { start: { line: 0, character: 4 }, end: { line: 0, character: 8 } } },
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
      { definitionProvider: true, implementationProvider: false },
    ),
    fromBackendUri: () => "src/main.py",
  });
}
