import assert from "node:assert/strict";
import { it } from "node:test";
import {
  FakeProcess,
  ready,
} from "../testing/direct-lsp/direct-lsp-test-support.js";

it("rejects every dynamic registration \
without accepting its request", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);
  process.respond({
    jsonrpc: "2.0",
    id: 90,
    method: "client/registerCapability",
    params: {
      registrations: [{ method: "workspace/executeCommand" }],
    },
  });
  assert.deepEqual(process.sent.at(-1), {
    jsonrpc: "2.0",
    id: 90,
    error: { code: -32601, message: "Method not found" },
  });
  assert.deepEqual(client.status().events, ["backend_capability_rejected"]);
  process.respond({
    jsonrpc: "2.0",
    id: "backend-request",
    method: "client/registerCapability",
    params: {},
  });
  assert.deepEqual(process.sent.at(-1), {
    jsonrpc: "2.0",
    id: "backend-request",
    error: { code: -32601, message: "Method not found" },
  });
});

it("ignores diagnostics but terminates \
on an unknown server notification", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);

  process.respond({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri: "file:///frozen/a.py",
      diagnostics: [{ message: "discarded" }],
    },
  });
  assert.equal(client.status().state, "ready");
  assert.deepEqual(client.status().events, ["backend_notification"]);

  process.respond({
    jsonrpc: "2.0",
    method: "workspace/unsafeExtension",
    params: {},
  });
  assert.equal(client.status().state, "failed");
  assert.equal(process.killed, true);
});

it("bounds retained notification events", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);
  for (let index = 0; index < 300; index += 1)
    process.respond({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: "file:///frozen/a.py", diagnostics: [] },
    });
  assert.equal(client.status().events.length, 256);
  assert.ok(
    client.status().events.every((event) => event === "backend_notification"),
  );
});
