import assert from "node:assert/strict";
import { it } from "node:test";
import {
  Process,
  policyFailureOptions,
  runtimeOptions,
} from "../testing/runtime-lsp-test-support.js";
import { createRustAdapter } from "../semantic/adapters/language-adapter.js";
import { createRuntimeLspBackend } from "../semantic/runtime/runtime-lsp-backend.js";

it("preserves post-initialize policy failure code", async () => {
  const process = new Process([]);
  let prepares = 0;
  const backend = createRuntimeLspBackend(
    runtimeOptions(
      process,
      policyFailureOptions(() => prepares++),
    ),
  );
  if (!backend.start) throw new Error("expected start");
  await assert.rejects(backend.start(), /backend_identity_changed/);
  assert.deepEqual(backend.readiness(), {
    state: "unavailable",
    failure_code: "backend_identity_changed",
  });
  const adapter = createRustAdapter({
    backend,
    compatible: true,
    backend_version: "1.0.0",
    unavailable_failure_code: "backend_unavailable",
  });
  assert.equal(adapter.status().failure_code, "backend_identity_changed");
  await assert.rejects(backend.start(), /backend_identity_changed/);
  assert.equal(prepares, 1);
  if (!backend.refresh) throw new Error("expected refresh");
  await assert.rejects(backend.refresh(), /backend_identity_changed/);
  assert.equal(prepares, 2);
});
