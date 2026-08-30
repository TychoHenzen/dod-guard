import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeSemanticAdapter } from "../testing/fake-semantic-adapter.js";
import {
  type BackendStatus,
  createProjectRevision,
  parseSemanticResult,
  type RelationCapability,
  type SemanticRequest,
  type SemanticResult,
} from "./contract.js";

const location = {
  path: "src/helper.rs",
  range: {
    start: { line: 1, character: 0 },
    end: { line: 3, character: 1 },
  },
} as const;

describe("normalized semantic adapter contract", () => {
  it("uses normalized symbols, source locations, revisions, and relation capabilities", () => {
    const revision = createProjectRevision(4, "manifest-sha256");
    const capability: RelationCapability = { state: "ready" };
    const status: BackendStatus = {
      language: "rust",
      backend_name: "rust-analyzer",
      backend_version: "1.0.0",
      discovery_source: "injected",
      state: "ready",
      last_transition_time: 0,
      capabilities: {
        definition: capability,
        references: { state: "unavailable" },
        type_definition: { state: "failed", failure_code: "backend_failed" },
        implementation: capability,
        callers: capability,
        callees: capability,
      },
    };

    assert.deepEqual(revision, { generation: 4, manifest_sha256: "manifest-sha256" });
    assert.deepEqual(status.capabilities.references, { state: "unavailable" });
    assert.deepEqual(status.capabilities.type_definition, { state: "failed", failure_code: "backend_failed" });
    assert.deepEqual(location, {
      path: "src/helper.rs",
      range: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
    });
  });

  it("validates normalized external results before the contract retains them", () => {
    const valid: SemanticResult = {
      operation: "definition",
      revision: createProjectRevision(1, "manifest-sha256"),
      relations: [
        {
          relation: "definition",
          symbol: {
            id: "rust:helper",
            name: "helper",
            language: "rust",
            kind: "function",
            location,
          },
          location,
        },
      ],
    };

    assert.deepEqual(parseSemanticResult(valid), valid);
    assert.throws(
      () =>
        parseSemanticResult({ ...valid, relations: [{ ...valid.relations[0], location: { path: "C:\\outside.rs" } }] }),
      /invalid semantic result/,
    );
  });

  it("lets the fake adapter control shared requests, normalized results, and failures", async () => {
    const adapter = new FakeSemanticAdapter();
    const request: SemanticRequest = { operation: "search", query: "helper" };
    const result: SemanticResult = {
      operation: "search",
      revision: createProjectRevision(2, "manifest-sha256"),
      symbols: [
        {
          id: "rust:helper",
          name: "helper",
          language: "rust",
          kind: "function",
          location,
        },
      ],
    };

    assert.deepEqual(adapter.readiness(), { state: "unavailable" });
    adapter.setReady();
    adapter.setResult(request, result);
    assert.deepEqual(await adapter.query(request), result);
    assert.deepEqual(adapter.requests(), [request]);

    adapter.setFailure(request, new Error("semantic backend stopped"));
    await assert.rejects(adapter.query(request), /semantic backend stopped/);
  });
});
