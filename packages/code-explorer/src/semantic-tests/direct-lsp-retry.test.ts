import assert from "node:assert/strict";
import { it } from "node:test";
import {
  FakeProcess,
  ready,
  tick,
} from "../testing/direct-lsp/direct-lsp-test-support.js";

it("retries one read-only request after the \
server reports content modified", async () => {
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
