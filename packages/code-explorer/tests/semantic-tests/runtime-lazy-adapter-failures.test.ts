import assert from "node:assert/strict";
import { it } from "node:test";
import { createLanguageAdapter } from "../../src/semantic/adapters/language-adapter-factory.js";
import { configuredCapabilities } from "../../src/semantic/adapters/language-adapter-status.js";
import { createLazyRuntimeAdapter } from "../../src/semantic/runtime/runtime-lazy-adapter.js";

const capabilities = configuredCapabilities(undefined);

function readyRust() {
  return createLanguageAdapter("rust", {
    backend: {
      readiness: () => ({ state: "ready" }),
      query: async () => {
        throw new Error("unused");
      },
    },
    compatible: true,
    backend_name: "rust-analyzer",
    backend_version: "fixture",
    discovery_source: "server_path",
    capabilities,
  });
}

it("a build failure is reported as failed with its code, not initializing", async () => {
  let builds = 0;
  const adapter = createLazyRuntimeAdapter({
    language: "rust",
    backendName: "rust-analyzer",
    capabilities,
    isPresent: async () => true,
    build: () => {
      builds += 1;
      throw new Error("backend_copy_failed");
    },
  });
  await assert.rejects(adapter.start?.() ?? Promise.resolve(), {
    message: "backend_copy_failed",
  });
  const status = adapter.status();
  assert.equal(builds, 1);
  assert.equal(status.state, "failed");
  assert.equal(status.failure_code, "backend_copy_failed");
});

it("a stopped adapter does not start again, like a disposed backend", async () => {
  let builds = 0;
  const adapter = createLazyRuntimeAdapter({
    language: "rust",
    backendName: "rust-analyzer",
    capabilities,
    isPresent: async () => true,
    build: () => {
      builds += 1;
      return readyRust();
    },
  });
  await adapter.start?.();
  await adapter.shutdown?.();
  await assert.rejects(adapter.start?.() ?? Promise.resolve(), {
    message: "backend_unavailable",
  });
  assert.equal(builds, 1);
});
