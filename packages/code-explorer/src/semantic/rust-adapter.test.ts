import assert from "node:assert/strict";
import { it } from "node:test";
import { FakeSemanticAdapter } from "../testing/fake-semantic-adapter.js";
import { createProjectRevision, type SemanticRequest, type SemanticResult } from "./contract.js";
import { createRustAdapter } from "./language-adapter.js";

const location = {
  path: "src/lib.rs",
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
};

function resultFor(request: SemanticRequest): SemanticResult {
  const revision = createProjectRevision(1, "manifest-sha256");
  if (request.operation === "search") return { operation: "search", revision, symbols: [] };
  if (request.operation === "focus") {
    return {
      operation: "focus",
      revision,
      symbol: { id: "rust:helper", name: "helper", language: "rust", kind: "function", location },
    };
  }
  return { operation: request.operation, revision, relations: [] };
}
it("reports a compatible Rust backend ready and forwards every shared request shape", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = createRustAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    capabilities: { callees: { state: "unavailable" } },
  });
  const requests: SemanticRequest[] = [
    { operation: "search", query: "helper" },
    { operation: "focus", symbol_id: "rust:helper" },
    { operation: "definition", symbol_id: "rust:helper" },
    { operation: "references", symbol_id: "rust:helper" },
    { operation: "type_definition", symbol_id: "rust:helper" },
    { operation: "implementation", symbol_id: "rust:helper" },
    { operation: "callers", symbol_id: "rust:helper" },
    { operation: "callees", symbol_id: "rust:helper" },
  ];
  for (const request of requests) backend.setResult(request, resultFor(request));

  assert.equal(adapter.status().language, "rust");
  assert.equal(adapter.status().state, "degraded");
  assert.deepEqual(adapter.status().capabilities.callers, { state: "ready" });
  assert.deepEqual(adapter.status().capabilities.callees, { state: "unavailable" });

  for (const request of requests) assert.deepEqual(await adapter.request(request), resultFor(request));
  assert.deepEqual(backend.requests(), requests);
});

it("observes injected backend readiness changes after adapter construction", () => {
  const backend = new FakeSemanticAdapter();
  const adapter = createRustAdapter({ backend, compatible: true, backend_version: "1.0.0" });

  assert.equal(adapter.status().state, "unavailable");
  backend.setReady();
  assert.equal(adapter.status().state, "ready");
  backend.setFailed("backend_failed");
  const failed = adapter.status();
  assert.equal(failed.state, "failed");
  assert.equal(failed.failure_code, "backend_failed");
  assert.equal(failed.last_transition_time > 0, true);
  assert.deepEqual(failed.capabilities.definition, { state: "unavailable" });
});

it("validates runtime requests and injected backend results at the adapter boundary", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = createRustAdapter({ backend, compatible: true, backend_version: "1.0.0" });

  await assert.rejects(
    adapter.request({ operation: "search", query: 7 } as unknown as SemanticRequest),
    /invalid semantic request/,
  );
  assert.deepEqual(backend.requests(), []);

  const invalidBackend = {
    readiness: () => ({ state: "ready" as const }),
    query: async () =>
      ({
        operation: "search",
        revision: createProjectRevision(1, "manifest-sha256"),
        symbols: [{}],
      }) as unknown as SemanticResult,
  };
  const invalidResultAdapter = createRustAdapter({
    backend: invalidBackend,
    compatible: true,
    backend_version: "1.0.0",
  });
  await assert.rejects(
    invalidResultAdapter.request({ operation: "search", query: "helper" }),
    /invalid semantic result/,
  );
});
