import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createSemanticBackend,
  degradedCapabilities,
  externalLocationClient,
  rustEntrySymbol,
  virtualLocationClient,
} from "../testing/direct-lsp-semantic-support.js";

it("rejects virtual backend locations instead of relabeling th", async () => {
  const source = rustEntrySymbol();
  const backend = createSemanticBackend({
    symbols: new Map([["entry", source]]),
    client: virtualLocationClient(),
    fromBackendUri: () => undefined,
  });
  await assert.rejects(
    backend.query({
      operation: "definition",
      symbol_id: "entry",
    }),
    /invalid_backend_result/,
  );
  assert.deepEqual(backend.readiness(), {
    state: "degraded",
  });
  assert.deepEqual(backend.capabilities?.(), degradedCapabilities);
  const references = await backend.query({
    operation: "references",
    symbol_id: "entry",
  });
  assert.equal(references.operation, "references");
});

it("returns a redacted external relation for an external file", async () => {
  const source = rustEntrySymbol();
  const backend = createSemanticBackend({
    symbols: new Map([["entry", source]]),
    client: externalLocationClient(),
    fromBackendUri: () => undefined,
  });
  const result = await backend.query({
    operation: "definition",
    symbol_id: "entry",
  });
  if (result.operation !== "definition") throw new Error("expected definition");
  assert.deepEqual(result.relations, [
    {
      relation: "definition",
      external: { external: true },
    },
  ]);
});
