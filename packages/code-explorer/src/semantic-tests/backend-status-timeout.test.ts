import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../index.js";
import { createRustAdapter } from "../semantic/adapters/language-adapter.js";

const result = {
  operation: "search" as const,
  revision: { generation: 0, manifest_sha256: "fixture" },
  symbols: [],
};

async function assertServerStatus(
  adapter: ReturnType<typeof createRustAdapter>,
): Promise<void> {
  const server = createServer({ adapters: [adapter] });
  const response = await server.call("code_status", {
    action: "status",
  });
  const backendStatus =
    "data" in response
      ? (response.data.backend_status as { backends: unknown[] })
      : undefined;
  assert.equal(Array.isArray(backendStatus?.backends), true);
}

it("times out initialization at thirty seconds and changes its", async () => {
  let time = 0;
  let state: { state: "initializing" } | { state: "refreshing" } = {
    state: "initializing",
  };
  const adapter = createRustAdapter({
    backend: {
      readiness: () => state,
      query: async () => result,
    },
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

  await assertServerStatus(adapter);
});
