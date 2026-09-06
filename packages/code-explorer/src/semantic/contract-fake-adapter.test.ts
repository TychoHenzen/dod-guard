import assert from "node:assert/strict";
import { it } from "node:test";
import { searchResult } from "../testing/contract-test-support.js";
import { FakeSemanticAdapter } from "../testing/fake-semantic-adapter.js";
import type { SemanticRequest } from "./contract.js";

it("lets the fake adapter control shared requests, normalized", async () => {
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
