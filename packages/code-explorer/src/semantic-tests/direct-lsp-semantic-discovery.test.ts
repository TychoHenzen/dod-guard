import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createSemanticBackend,
  projectBackendPath,
  pythonDiscoverySymbol,
  pythonOpenedDiscoveryBackend,
  semanticRootWithRead,
  workspaceSearchClient,
} from "../testing/direct-lsp/direct-lsp-semantic-support.js";

it("focuses the exact symbol identity returned by the live workspace", async () => {
  const methods: string[] = [];
  const backend = createSemanticBackend({
    client: workspaceSearchClient(methods),
    fromBackendUri: projectBackendPath,
  });
  const search = await backend.query({
    operation: "search",
    query: "helper",
  });
  if (search.operation !== "search") throw new Error("expected search");
  const discovered = search.symbols[0];
  assert.ok(discovered);
  const focus = await backend.query({
    operation: "focus",
    symbol_id: discovered.id,
  });
  assert.deepEqual(focus, {
    operation: "focus",
    revision: { generation: 0, manifest_sha256: "fixture" },
    symbol: discovered,
    content: {
      body: "fn main() {}\n",
      visible_symbols: [{ name: "helper", symbol_id: discovered.id }],
    },
  });
  assert.deepEqual(methods, ["workspace/symbol"]);
});

it("discovers Python symbols from approved opened mirror documents", async () => {
  const methods: string[] = [];
  const backend = pythonOpenedDiscoveryBackend(methods);
  const search = await backend.query({
    operation: "search",
    query: "helper",
  });
  if (search.operation !== "search") throw new Error("expected search");
  assert.deepEqual(methods, ["textDocument/documentSymbol"]);
  assert.deepEqual(search.symbols[0], pythonDiscoverySymbol(0));
});
