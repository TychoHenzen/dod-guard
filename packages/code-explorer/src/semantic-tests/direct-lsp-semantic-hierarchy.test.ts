import assert from "node:assert/strict";
import { it } from "node:test";
import {
  assertHierarchyRelation,
  createSemanticBackend,
  incomingHierarchyClient,
  rustEntrySymbol,
} from "../testing/direct-lsp-semantic-support.js";

it("uses server-issued hierarchy items and preserves target me", async () => {
  const methods: string[] = [];
  const backend = createSemanticBackend({
    symbols: new Map([["entry", rustEntrySymbol()]]),
    client: incomingHierarchyClient(methods),
    fromBackendUri: (uri) => (uri === "file:///project/src/main.rs" ? "src/main.rs" : undefined),
  });
  const result = await backend.query({
    operation: "callers",
    symbol_id: "entry",
  });
  assert.deepEqual(methods, ["textDocument/prepareCallHierarchy", "callHierarchy/incomingCalls"]);
  assertHierarchyRelation(result, "callers", "caller", 2);
});
