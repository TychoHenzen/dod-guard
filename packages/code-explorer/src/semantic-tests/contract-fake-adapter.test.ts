import assert from "node:assert/strict";
import { it } from "node:test";
import type { SemanticRequest } from "../semantic/contracts/contract.js";
import { searchResult } from "../testing/contracts/contract-test-support.js";
import { FakeSemanticAdapter } from "../testing/semantic/\
fake-semantic-adapter.js";

it("lets the fake adapter control shared \
requests and normalized results", async () => {
  const adapter = new FakeSemanticAdapter();
  const request: SemanticRequest = {
    operation: "search",
    query: "helper",
  };
  const result = searchResult();
  assert.deepEqual(adapter.readiness(), {
    state: "unavailable",
  });
  adapter.setReady();
  adapter.setResult(request, result);
  assert.deepEqual(await adapter.query(request), result);
  assert.deepEqual(adapter.requests(), [request]);
  adapter.setFailure(request, new Error("semantic backend stopped"));
  await assert.rejects(adapter.query(request), /semantic backend stopped/);
});
