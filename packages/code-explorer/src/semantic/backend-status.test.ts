import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../index.js";
import { FakeSemanticAdapter } from "../testing/fake-semantic-adapter.js";
import { createBackendStatusReport } from "./backend-status.js";
import { createPythonAdapter, createRustAdapter } from "./language-adapter.js";

const revision = { generation: 0, manifest_sha256: "fixture" };
const result = { operation: "search" as const, revision, symbols: [] };

function backend(state: "ready" | "unavailable" | "failed", failureCode?: string): FakeSemanticAdapter {
  const fake = new FakeSemanticAdapter();
  if (state === "ready") fake.setReady();
  if (state === "failed") fake.setFailed(failureCode ?? "initialization_failed");
  fake.setResult(result);
  return fake;
}
it("reports a missing backend without attempting semantic work", () => {
  const adapter = createRustAdapter({
    backend: backend("unavailable"),
    compatible: true,
    backend_version: "missing",
  });

  const report = createBackendStatusReport([adapter]);

  assert.equal(report.backends[0].state, "unavailable");
  assert.equal(report.backends[0].last_transition_time > 0, true);
  assert.deepEqual(report.backends[0].capabilities.definition, { state: "unavailable" });
});
it("keeps supported navigation ready when call hierarchy is unavailable", () => {
  const adapter = createRustAdapter({
    backend: backend("ready"),
    compatible: true,
    backend_version: "1.0.0",
    capabilities: { callers: { state: "unavailable" }, callees: { state: "unavailable" } },
  });

  const status = createBackendStatusReport([adapter]).backends[0];

  assert.equal(status.state, "degraded");
  assert.deepEqual(status.capabilities.callers, { state: "unavailable" });
  assert.deepEqual(status.capabilities.callees, { state: "unavailable" });
  assert.deepEqual(status.capabilities.definition, { state: "ready" });
  assert.deepEqual(status.capabilities.references, { state: "ready" });
});
it("isolates a stable initialization failure from ready adapters", () => {
  const failed = createRustAdapter({
    backend: backend("failed", "initialization_failed"),
    compatible: true,
    backend_version: "1.0.0",
  });
  const ready = createPythonAdapter({
    backend: backend("ready"),
    compatible: true,
    backend_version: "1.0.0",
  });

  const report = createBackendStatusReport([failed, ready]);

  assert.equal(report.backends[0].failure_code, "initialization_failed");
  assert.equal(report.backends[1].state, "ready");
  assert.equal(JSON.stringify(report).includes("protocol"), false);
});
it("keeps discovery-only data separate when every backend is unavailable", () => {
  const adapter = createRustAdapter({
    backend: backend("unavailable"),
    compatible: true,
    backend_version: "missing",
  });

  assert.deepEqual(createBackendStatusReport([adapter]).navigation, {
    discovery: "discovery_only",
    focus: "backend_unavailable",
    relations: "backend_unavailable",
  });
});
it("reports an incompatible backend without treating it as ready", () => {
  const adapter = createRustAdapter({
    backend: backend("ready"),
    compatible: false,
    backend_version: "0.1.0",
  });

  const status = createBackendStatusReport([adapter]).backends[0];

  assert.equal(status.state, "unavailable");
  assert.equal(status.failure_code, "unsupported_backend_version");
});

it("times out initialization at thirty seconds and changes its transition time only on state changes", async () => {
  let time = 0;
  let state: { state: "initializing" } | { state: "refreshing" } = { state: "initializing" };
  const adapter = createRustAdapter({
    backend: { readiness: () => state, query: async () => result },
    compatible: true,
    backend_version: "1.0.0",
    now: () => time,
  });

  assert.equal(adapter.status().state, "initializing");
  time = 29_999;
  assert.equal(adapter.status().state, "initializing");
  assert.equal(adapter.status().last_transition_time, 0);
  time = 30_000;
  assert.deepEqual(adapter.status().failure_code, "initialization_timeout");
  state = { state: "refreshing" };
  time = 30_001;
  assert.equal(adapter.status().state, "refreshing");

  const server = createServer({ adapters: [adapter] });
  const response = await server.call("code_status", { action: "status" });
  const backendStatus = "data" in response ? (response.data.backend_status as { backends: unknown[] }) : undefined;
  assert.equal(Array.isArray(backendStatus?.backends), true);
});
