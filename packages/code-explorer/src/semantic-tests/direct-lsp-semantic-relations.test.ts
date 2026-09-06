import assert from "node:assert/strict";
import { it } from "node:test";
import {
  assertOpenedTwice,
  createSemanticBackend,
  locationClient,
  mainRustSymbol,
  projectBackendPath,
} from "../testing/direct-lsp-semantic-support.js";

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
