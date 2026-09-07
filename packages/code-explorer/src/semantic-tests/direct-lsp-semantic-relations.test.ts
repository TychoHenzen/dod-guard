import assert from "node:assert/strict";
import { it } from "node:test";
import {
  assertOpenedTwice,
  createSemanticBackend,
  locationClient,
  mainRustSymbol,
  projectBackendPath,
} from "../testing/direct-lsp-semantic-support.js";

it("does not degrade a relation after a transient LSP request failure", async () => {
  let requests = 0;
  const source = mainRustSymbol();
  const backend = createSemanticBackend({
    symbols: new Map([[source.id, source]]),
    client: {
      ...locationClient([]),
      request: async () => {
        requests += 1;
        if (requests === 1) throw new Error("transient");
        return {
          uri: "file:///project/src/main.rs",
          range: {
            start: { line: 0, character: 3 },
            end: { line: 0, character: 7 },
          },
        };
      },
    },
  });

  await assert.rejects(backend.query({ operation: "definition", symbol_id: source.id }), /transient/);
  const result = await backend.query({
    operation: "definition",
    symbol_id: source.id,
  });
  assert.equal(result.operation, "definition");
});

it("maps definition and references through protected semantic", async () => {
  const methods: string[] = [];
  const backend = createSemanticBackend({
    language: "rust",
    symbols: new Map([["entry", mainRustSymbol()]]),
    client: locationClient(methods),
    fromBackendUri: projectBackendPath,
  });
  const definition = await backend.query({
    operation: "definition",
    symbol_id: "entry",
  });
  const references = await backend.query({
    operation: "references",
    symbol_id: "entry",
  });
  assert.equal(definition.operation, "definition");
  assert.equal(references.operation, "references");
  assert.deepEqual(methods, ["textDocument/definition", "textDocument/references"]);
});

it("delegates protected source opening to the epoch-aware clie", async () => {
  const opened: Array<{ uri: string; content: unknown }> = [];
  const source = mainRustSymbol();
  const backend = createSemanticBackend({
    symbols: new Map([[source.id, source]]),
    capabilities: {} as never,
    client: locationClient([], (uri, content) => opened.push({ uri, content })),
    fromBackendUri: () => "src/main.rs",
  });
  await backend.query({
    operation: "definition",
    symbol_id: source.id,
  });
  await backend.query({
    operation: "definition",
    symbol_id: source.id,
  });
  assertOpenedTwice(opened);
});
