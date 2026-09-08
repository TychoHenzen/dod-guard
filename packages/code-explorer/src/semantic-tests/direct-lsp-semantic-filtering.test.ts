import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createSemanticBackend,
  projectBackendPath,
  semanticClient,
  unavailableRelationBackend,
  workspaceSearchClient,
} from "../testing/direct-lsp/direct-lsp-semantic-support.js";

it("preserves public workspace-symbol names and kinds for discovery", async () => {
  const backend = createSemanticBackend({
    symbols: new Map(),
    capabilities: {} as never,
    client: workspaceSearchClient([]),
    fromBackendUri: projectBackendPath,
  });
  const result = await backend.query({
    operation: "search",
    query: "helper",
  });
  if (result.operation !== "search") throw new Error("expected search result");
  assert.deepEqual(
    result.symbols.map(({ name, kind, location }) => ({
      name,
      kind,
      path: location.path,
    })),
    [
      {
        name: "helper",
        kind: "function",
        path: "src/main.rs",
      },
    ],
  );
});

it("does not send a relation request that initialize reported unavailable", async () => {
  const methods: string[] = [];
  const backend = unavailableRelationBackend(methods);
  await assert.rejects(
    backend.query({
      operation: "implementation",
      symbol_id: "entry",
    }),
    /backend_unavailable/,
  );
  assert.deepEqual(methods, []);
});

it("does not retain a backend URI outside the protected project root", async () => {
  const backend = createSemanticBackend({
    symbols: new Map(),
    client: semanticClient(),
    fromBackendUri: () => undefined,
  });
  const result = await backend.query({
    operation: "search",
    query: "main",
  });
  assert.deepEqual(result, {
    operation: "search",
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbols: [],
  });
});
