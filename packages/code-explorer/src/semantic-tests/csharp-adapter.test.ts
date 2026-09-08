import assert from "node:assert/strict";
import { it } from "node:test";
import { createCSharpAdapter } from "../semantic/adapters/language-adapter.js";
import { FakeSemanticAdapter } from "../testing/semantic/fake-semantic-adapter.js";
import { adapterRequests, createAdapterResult } from "../testing/semantic/language-adapter-test-support.js";

it("reports a compatible C# backend and forwards every semantic request", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = createCSharpAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    capabilities: {
      implementation: { state: "unavailable" },
    },
  });
  const resultFor = createAdapterResult("csharp", "src/Helper.cs", "method");
  const requests = adapterRequests("csharp:helper");
  for (const request of requests) backend.setResult(request, resultFor(request));

  assert.equal(adapter.status().language, "csharp");
  assert.equal(adapter.status().state, "degraded");
  assert.deepEqual(adapter.status().capabilities.callers, {
    state: "ready",
  });
  assert.deepEqual(adapter.status().capabilities.implementation, {
    state: "unavailable",
  });

  for (const request of requests) assert.deepEqual(await adapter.request(request), resultFor(request));
  assert.deepEqual(backend.requests(), requests);
});
