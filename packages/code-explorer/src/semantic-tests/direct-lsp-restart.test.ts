import assert from "node:assert/strict";
import { it } from "node:test";
import { createDirectLspClient } from "../semantic/direct-lsp/direct-lsp.js";
import { FakeProcess, ready, restartFixture, Scheduler, tick } from "../testing/direct-lsp-test-support.js";

it("restarts actual replacement processes at 250ms and 1s then stops", async () => {
  const client = await restartFixture();
  assert.deepEqual(client.status().restart_delays_ms, [250, 1_000]);
  assert.equal(client.status().state, "unavailable");
  client.refresh();
  assert.equal(client.status().state, "initializing");
});

it("force terminates ignored shutdown and counts initialization failures", async () => {
  const process = new FakeProcess();
  const { client, scheduler } = await ready(process);
  const stop = client.shutdown();
  scheduler.advance(5_000);
  await tick();
  scheduler.advance(5_000);
  await stop;
  assert.equal(process.killed, true);
  assert.deepEqual(client.status().restart_delays_ms, [250]);

  const bad = new FakeProcess();
  const badScheduler = new Scheduler();
  const badClient = createDirectLspClient({
    root_uri: "file:///frozen",
    capabilities: {},
    safe_initialization_options: {},
    scheduler: badScheduler,
  });
  const start = badClient.start(bad);
  bad.respond({ jsonrpc: "2.0", id: 1, result: {} });
  await assert.rejects(start, { code: "backend_failed" });
  assert.deepEqual(badClient.status().restart_delays_ms, [250]);
});
