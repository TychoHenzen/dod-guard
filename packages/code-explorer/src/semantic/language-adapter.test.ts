import assert from "node:assert/strict";
import { it } from "node:test";
import { createRustAdapter } from "./language-adapter.js";

it("reports compatible backend readiness and preserves its validated result boundary", async () => {
  let state: "initializing" | "ready" = "initializing";
  let now = 0;
  const adapter = createRustAdapter({
    backend: {
      readiness: () => ({ state }),
      query: async () => ({
        operation: "definition",
        revision: { generation: 1, manifest_sha256: "fixture" },
        relations: [],
      }),
    },
    compatible: true,
    backend_version: "1",
    now: () => now,
  });
  assert.equal(adapter.status().state, "initializing");
  now = 30_000;
  assert.deepEqual(adapter.status().failure_code, "initialization_timeout");
  state = "ready";
  assert.equal(adapter.status().state, "ready");
  assert.deepEqual(await adapter.request({ operation: "definition", symbol_id: "x" }), {
    operation: "definition",
    revision: { generation: 1, manifest_sha256: "fixture" },
    relations: [],
  });
});
