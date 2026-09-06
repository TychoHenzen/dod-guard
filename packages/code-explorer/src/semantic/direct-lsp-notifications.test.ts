import assert from "node:assert/strict";
import { it } from "node:test";
import {
  FakeProcess,
  ready,
  tick,
} from "../testing/direct-lsp-test-support.js";

it("rejects every dynamic registration without accepting its r", async () => {
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

it("ignores diagnostics but terminates on an unknown server no", async () => {
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

it("retries one read-only request after the server reports con", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);
  const pending = client.request("textDocument/references", {
    textDocument: { uri: "file:///frozen/a.rs" },
  });
  const first = process.sent.at(-1) as { id: number };
  process.respond({
    jsonrpc: "2.0",
    id: first.id,
    error: { code: -32801, message: "content modified" },
  });
  await tick();
  const second = process.sent.at(-1) as {
    id: number;
    method: string;
  };
  assert.equal(second.method, "textDocument/references");
  assert.notEqual(second.id, first.id);
  process.respond({
    jsonrpc: "2.0",
    id: second.id,
    result: [{ uri: "file:///frozen/a.rs" }],
  });
  assert.deepEqual(await pending, [{ uri: "file:///frozen/a.rs" }]);
  assert.equal(client.status().state, "ready");
});
