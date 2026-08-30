import assert from "node:assert/strict";
import { it } from "node:test";
import { FakeSemanticAdapter } from "../testing/fake-semantic-adapter.js";
import { createProjectRevision, type SemanticRequest, type SemanticResult } from "./contract.js";
import { createCSharpAdapter } from "./language-adapter.js";

const location = {
  path: "src/Helper.cs",
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
};

function resultFor(request: SemanticRequest): SemanticResult {
  const revision = createProjectRevision(1, "manifest-sha256");
  if (request.operation === "search") return { operation: "search", revision, symbols: [] };
  if (request.operation === "focus") {
    return {
      operation: "focus",
      revision,
      symbol: { id: "csharp:helper", name: "helper", language: "csharp", kind: "method", location },
    };
  }
  return { operation: request.operation, revision, relations: [] };
}

// covers: code-explorer/language-adapters :: Rust, Python, and C# share one capability-aware navigation contract :: C# project is ready
it("reports a compatible C# backend ready and forwards every shared request shape", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = createCSharpAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    capabilities: { implementation: { state: "unavailable" } },
  });
  const requests: SemanticRequest[] = [
    { operation: "search", query: "helper" },
    { operation: "focus", symbol_id: "csharp:helper" },
    { operation: "definition", symbol_id: "csharp:helper" },
    { operation: "references", symbol_id: "csharp:helper" },
    { operation: "type_definition", symbol_id: "csharp:helper" },
    { operation: "implementation", symbol_id: "csharp:helper" },
    { operation: "callers", symbol_id: "csharp:helper" },
    { operation: "callees", symbol_id: "csharp:helper" },
  ];
  for (const request of requests) backend.setResult(request, resultFor(request));

  assert.equal(adapter.status().language, "csharp");
  assert.equal(adapter.status().state, "degraded");
  assert.deepEqual(adapter.status().capabilities.callers, { state: "ready" });
  assert.deepEqual(adapter.status().capabilities.implementation, { state: "unavailable" });

  for (const request of requests) assert.deepEqual(await adapter.request(request), resultFor(request));
  assert.deepEqual(backend.requests(), requests);
});
