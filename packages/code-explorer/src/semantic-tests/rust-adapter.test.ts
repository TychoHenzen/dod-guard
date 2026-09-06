import assert from "node:assert/strict";
import { it } from "node:test";
import { createRustAdapter } from "../semantic/adapters/language-adapter.js";
import type { SemanticRequest } from "../semantic/contracts/contract.js";
import { FakeSemanticAdapter } from "../testing/fake-semantic-adapter.js";
import {
  adapterRequests,
  createAdapterResult,
  invalidSemanticResultBackend,
} from "../testing/language-adapter-test-support.js";

function rustAdapter(
  backend: Parameters<typeof createRustAdapter>[0]["backend"],
  capabilities?: Parameters<typeof createRustAdapter>[0]["capabilities"],
) {
  return createRustAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    ...(capabilities ? { capabilities } : {}),
  });
}

it("reports a compatible Rust backend ready and forwards every", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = rustAdapter(backend, {
    callees: { state: "unavailable" },
  });
  const resultFor = createAdapterResult("rust", "src/lib.rs", "function");
  const requests = adapterRequests("rust:helper");
  for (const request of requests)
    backend.setResult(request, resultFor(request));

  assert.equal(adapter.status().language, "rust");
  assert.equal(adapter.status().state, "degraded");
  assert.deepEqual(adapter.status().capabilities.callers, {
    state: "ready",
  });
  assert.deepEqual(adapter.status().capabilities.callees, {
    state: "unavailable",
  });

  for (const request of requests)
    assert.deepEqual(await adapter.request(request), resultFor(request));
  assert.deepEqual(backend.requests(), requests);
});

it("observes injected backend readiness changes after adapter constr", () => {
  const backend = new FakeSemanticAdapter();
  const adapter = rustAdapter(backend);

  assert.equal(adapter.status().state, "unavailable");
  backend.setReady();
  assert.equal(adapter.status().state, "ready");
  backend.setFailed("backend_failed");
  const failed = adapter.status();
  assert.equal(failed.state, "failed");
  assert.equal(failed.failure_code, "backend_failed");
  assert.equal(failed.last_transition_time > 0, true);
  assert.deepEqual(failed.capabilities.definition, {
    state: "unavailable",
  });
});

it("validates runtime requests and injected backend results at", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = rustAdapter(backend);

  await assert.rejects(
    adapter.request({
      operation: "search",
      query: 7,
    } as unknown as SemanticRequest),
    /invalid semantic request/,
  );
  assert.deepEqual(backend.requests(), []);

  const invalidResultAdapter = rustAdapter(invalidSemanticResultBackend());
  await assert.rejects(
    invalidResultAdapter.request({
      operation: "search",
      query: "helper",
    }),
    /invalid semantic result/,
  );
});
