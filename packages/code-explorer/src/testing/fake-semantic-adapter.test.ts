import assert from "node:assert/strict";
import { it } from "node:test";
import { FakeSemanticAdapter } from "./fake-semantic-adapter.js";

it("records requests and supports default, request-specific, and failing results without a backend process", async () => {
  const adapter = new FakeSemanticAdapter<string>();
  const request = { operation: "definition" as const, symbol_id: "symbol" };
  adapter.setReady();
  adapter.setResult("default");
  adapter.setResult(request, "specific");
  assert.equal(adapter.readiness().state, "ready");
  assert.equal(await adapter.query(), "default");
  assert.equal(await adapter.query(request), "specific");
  assert.deepEqual(adapter.requests(), [request]);
  adapter.setFailure(request, new Error("fixture failure"));
  await assert.rejects(adapter.query(request), /fixture failure/);
});
