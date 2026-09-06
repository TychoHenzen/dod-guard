import assert from "node:assert/strict";
import { it } from "node:test";
import { location } from "../testing/contract-test-support.js";
import {
  type BackendStatus,
  parseSemanticResult,
  type RelationCapabilities,
  type SemanticResult,
} from "../semantic/contracts/contract.js";

it("uses normalized symbols, source locations, revisions, and relati", () => {
  const revision = {
    generation: 4,
    manifest_sha256: "manifest-sha256",
  };
  const capability: RelationCapabilities["definition"] = {
    state: "ready",
  };
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
      type_definition: {
        state: "failed",
        failure_code: "backend_failed",
      },
      implementation: capability,
      callers: capability,
      callees: capability,
    },
  };
  assert.deepEqual(revision, {
    generation: 4,
    manifest_sha256: "manifest-sha256",
  });
  assert.deepEqual(status.capabilities.references, {
    state: "unavailable",
  });
  assert.deepEqual(status.capabilities.type_definition, {
    state: "failed",
    failure_code: "backend_failed",
  });
  assert.deepEqual(location, {
    path: "src/helper.rs",
    range: {
      start: { line: 1, character: 0 },
      end: { line: 3, character: 1 },
    },
  });
});

it("validates normalized external results before the contract retain", () => {
  const valid: SemanticResult = {
    operation: "definition",
    revision: {
      generation: 1,
      manifest_sha256: "manifest-sha256",
    },
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
      parseSemanticResult({
        ...valid,
        relations: [
          {
            ...valid.relations[0],
            location: { path: "C:\\outside.rs" },
          },
        ],
      }),
    /invalid semantic result/,
  );
});
