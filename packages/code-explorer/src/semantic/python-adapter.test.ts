import assert from "node:assert/strict";
import { it } from "node:test";
import { FakeSemanticAdapter } from "../testing/fake-semantic-adapter.js";
import { createProjectRevision, type SemanticRequest, type SemanticResult } from "./contract.js";
import { createPythonAdapter } from "./language-adapter.js";

const location = {
  path: "src/sample.py",
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
};

function resultFor(request: SemanticRequest): SemanticResult {
  const revision = createProjectRevision(1, "manifest-sha256");
  if (request.operation === "search") return { operation: "search", revision, symbols: [] };
  if (request.operation === "focus") {
    return {
      operation: "focus",
      revision,
      symbol: { id: "python:helper", name: "helper", language: "python", kind: "function", location },
    };
  }
  return { operation: request.operation, revision, relations: [] };
}
it("reports a compatible Python backend ready and forwards every shared request shape", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = createPythonAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    capabilities: { callers: { state: "failed", failure_code: "backend_failed" } },
  });
  const requests: SemanticRequest[] = [
    { operation: "search", query: "helper" },
    { operation: "focus", symbol_id: "python:helper" },
    { operation: "definition", symbol_id: "python:helper" },
    { operation: "references", symbol_id: "python:helper" },
    { operation: "type_definition", symbol_id: "python:helper" },
    { operation: "implementation", symbol_id: "python:helper" },
    { operation: "callers", symbol_id: "python:helper" },
    { operation: "callees", symbol_id: "python:helper" },
  ];
  for (const request of requests) backend.setResult(request, resultFor(request));

  assert.equal(adapter.status().language, "python");
  assert.equal(adapter.status().state, "degraded");
  assert.deepEqual(adapter.status().capabilities.definition, { state: "ready" });
  assert.deepEqual(adapter.status().capabilities.callers, { state: "failed", failure_code: "backend_failed" });

  for (const request of requests) assert.deepEqual(await adapter.request(request), resultFor(request));
  assert.deepEqual(backend.requests(), requests);
});
