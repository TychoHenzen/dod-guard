import assert from "node:assert/strict";
import { it } from "node:test";
import {
  encode,
  FakeProcess,
  ready,
  tick,
} from "../testing/direct-lsp-test-support.js";

async function assertInvalidFrame(invalid: Uint8Array): Promise<void> {
  const process = new FakeProcess();
  const { client } = await ready(process);
  const pending = client.request("textDocument/definition", {});
  process.emit(invalid);
  await assert.rejects(pending, { code: "backend_failed" });
  assert.equal(process.killed, true);
  assert.equal(client.status().state, "failed");
}

it("terminates on malformed, non-ASCII, incomplete, invalid, a", async () => {
  for (const invalid of [
    new TextEncoder().encode("Content-Length: 2\n\n{}"),
    new Uint8Array([
      67, 111, 110, 116, 101, 110, 116, 45, 76, 101, 110, 103, 116, 104, 58, 32,
      49, 128, 13, 10, 13, 10, 123,
    ]),
    encode({ jsonrpc: "2.0", id: 0, result: [] }),
    encode({
      jsonrpc: "2.0",
      id: 2,
      result: "x".repeat(1024 * 1024),
    }),
  ]) {
    await assertInvalidFrame(invalid);
  }
  const incomplete = new FakeProcess();
  const { client: incompleteClient } = await ready(incomplete);
  const incompletePending = incompleteClient.request(
    "textDocument/definition",
    {},
  );
  incomplete.emit(new TextEncoder().encode("Content-Length: 4\r\n\r\n{"));
  incomplete.crash();
  await assert.rejects(incompletePending, {
    code: "backend_failed",
  });
  assert.equal(incomplete.killed, true);
});

it("cancels timeouts, rejects writes locally, and ignores late", async () => {
  const process = new FakeProcess();
  const { client, scheduler } = await ready(process);
  const pending = client.request("textDocument/references", {});
  const id = (process.sent.at(-1) as { id: number }).id;
  scheduler.advance(10);
  await assert.rejects(pending, {
    code: "backend_timeout",
  });
  assert.deepEqual(process.sent.at(-1), {
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id },
  });
  process.respond({ jsonrpc: "2.0", id, result: ["late"] });
  assert.equal(client.status().state, "ready");
  await assert.rejects(client.request("workspace/executeCommand", {}), {
    code: "backend_write_rejected",
  });
});

it("force terminates after two semantic timeouts and rejects o", async () => {
  const process = new FakeProcess();
  const { client, scheduler } = await ready(process);
  const first = client.request("textDocument/definition", {});
  scheduler.advance(10);
  await assert.rejects(first, { code: "backend_timeout" });
  const second = client.request("textDocument/references", {});
  const third = client.request("textDocument/implementation", {});
  const lateId = (process.sent.at(-1) as { id: number }).id;
  scheduler.advance(10);
  await assert.rejects(second, { code: "backend_timeout" });
  await assert.rejects(third, { code: "backend_crashed" });
  assert.equal(process.killed, true);
  assert.deepEqual(client.status().restart_delays_ms, [250]);
  process.respond({
    jsonrpc: "2.0",
    id: lateId,
    result: ["late"],
  });
  assert.equal(client.status().state, "failed");
});
