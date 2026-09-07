import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createSemanticBackend,
  csharpDiscoverySymbol,
  csharpServerPathDiscoveryBackend,
  pythonDiscoverySymbol,
  pythonServerPathDiscoveryBackend,
} from "../testing/direct-lsp-semantic-support.js";

it("uses bounded server-path discovery when Pyright returns no nodes", async () => {
  const backend = pythonServerPathDiscoveryBackend();
  const search = await backend.query({
    operation: "search",
    query: "helper",
  });
  if (search.operation !== "search") throw new Error("expected search");
  assert.deepEqual(
    search.symbols.find(({ name }) => name === "helper"),
    pythonDiscoverySymbol(1),
  );
});

it("uses bounded server-path discovery when Roslyn returns no nodes", async () => {
  const backend = csharpServerPathDiscoveryBackend();
  const search = await backend.query({
    operation: "search",
    query: "Helper",
  });
  if (search.operation !== "search") throw new Error("expected search");
  assert.deepEqual(
    search.symbols.find(({ name }) => name === "Helper"),
    csharpDiscoverySymbol(),
  );
});
