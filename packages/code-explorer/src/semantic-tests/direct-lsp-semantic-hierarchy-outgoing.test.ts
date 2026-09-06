import assert from "node:assert/strict";
import { it } from "node:test";
import {
  assertHierarchyRelation,
  createSemanticBackend,
  outgoingHierarchyClient,
  rustEntrySymbol,
} from "../testing/direct-lsp-semantic-support.js";

it("uses outgoing hierarchy targets and rejects virtual or mal", async () => {
  const methods: string[] = [];
  const source = rustEntrySymbol();
  const backend = createSemanticBackend({
    symbols: new Map([["entry", source]]),
    client: outgoingHierarchyClient(methods),
    toBackendUri: (location) => `file:///project/${location.path}`,
    fromBackendUri: (uri) =>
      uri === "file:///project/src/main.rs" ? "src/main.rs" : undefined,
  });
  const result = await backend.query({
    operation: "callees",
    symbol_id: "entry",
  });
  assert.deepEqual(methods, [
    "textDocument/prepareCallHierarchy",
    "callHierarchy/outgoingCalls",
  ]);
  assertHierarchyRelation(result, "callees", "callee", 3);
});
