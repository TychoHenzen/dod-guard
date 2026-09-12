import assert from "node:assert/strict";
import { it } from "node:test";
import { createBackendStatusReport } from "../semantic/\
backend-status/backend-status.js";
import {
  createPythonAdapter,
  createRustAdapter,
} from "../semantic/adapters/language-adapter.js";
import { statusBackend } from "../testing/backend/\
backend-status-test-support.js";

it("reports a missing backend without attempting semantic work", () => {
  const adapter = createRustAdapter({
    backend: statusBackend("unavailable"),
    compatible: true,
    backend_version: "missing",
  });

  const report = createBackendStatusReport([adapter]);

  assert.equal(report.backends[0].state, "unavailable");
  assert.equal(report.backends[0].last_transition_time > 0, true);
  assert.deepEqual(report.backends[0].capabilities.definition, {
    state: "unavailable",
  });
});
it("keeps supported navigation ready \
when call hierarchy is unavailable", () => {
  const adapter = createRustAdapter({
    backend: statusBackend("ready"),
    compatible: true,
    backend_version: "1.0.0",
    capabilities: {
      callers: { state: "unavailable" },
      callees: { state: "unavailable" },
    },
  });

  const status = createBackendStatusReport([adapter]).backends[0];

  assert.equal(status.state, "degraded");
  assert.deepEqual(status.capabilities.callers, {
    state: "unavailable",
  });
  assert.deepEqual(status.capabilities.callees, {
    state: "unavailable",
  });
  assert.deepEqual(status.capabilities.definition, {
    state: "ready",
  });
  assert.deepEqual(status.capabilities.references, {
    state: "ready",
  });
});
it("isolates a stable initialization failure from ready adapters", () => {
  const failed = createRustAdapter({
    backend: statusBackend("failed", "initialization_failed"),
    compatible: true,
    backend_version: "1.0.0",
  });
  const ready = createPythonAdapter({
    backend: statusBackend("ready"),
    compatible: true,
    backend_version: "1.0.0",
  });

  const report = createBackendStatusReport([failed, ready]);

  assert.equal(report.backends[0].failure_code, "initialization_failed");
  assert.equal(report.backends[1].state, "ready");
  assert.equal(JSON.stringify(report).includes("protocol"), false);
});
it("keeps discovery-only data separate \
when every backend is unavailable", () => {
  const adapter = createRustAdapter({
    backend: statusBackend("unavailable"),
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
    backend: statusBackend("ready"),
    compatible: false,
    backend_version: "0.1.0",
  });

  const status = createBackendStatusReport([adapter]).backends[0];

  assert.equal(status.state, "unavailable");
  assert.equal(status.failure_code, "unsupported_backend_version");
});
