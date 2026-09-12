import assert from "node:assert/strict";
import { it } from "node:test";
import { createPythonAdapter } from "../semantic/adapters/language-adapter.js";
import { FakeSemanticAdapter } from "../testing/semantic/\
fake-semantic-adapter.js";
import {
  adapterRequests,
  createAdapterResult,
} from "../testing/semantic/language-adapter-test-support.js";

it("reports a compatible Python backend and forwards requests", async () => {
  const backend = new FakeSemanticAdapter();
  backend.setReady();
  const adapter = createPythonAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    capabilities: {
      callers: {
        state: "failed",
        failure_code: "backend_failed",
      },
    },
  });
  const resultFor = createAdapterResult("python", "src/sample.py", "function");
  const requests = adapterRequests("python:helper");
  for (const request of requests)
    backend.setResult(request, resultFor(request));
  assert.equal(adapter.status().language, "python");
  assert.equal(adapter.status().state, "degraded");
  assert.equal(adapter.status().capabilities.definition.state, "ready");
  assert.deepEqual(adapter.status().capabilities.callers, {
    state: "failed",
    failure_code: "backend_failed",
  });
  for (const request of requests)
    assert.deepEqual(await adapter.request(request), resultFor(request));
  assert.deepEqual(backend.requests(), requests);
});
