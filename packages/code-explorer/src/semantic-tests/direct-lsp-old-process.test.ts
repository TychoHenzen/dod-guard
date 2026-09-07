import assert from "node:assert/strict";
import { it } from "node:test";
import { oldProcessFixture } from "../testing/direct-lsp-test-support.js";

it("rejects unsolicited requests and discards allowed notifications", async () => {
  const { client, old, replacement, pending, id } = await oldProcessFixture();
  old.respond({ jsonrpc: "2.0", id, result: ["old"] });
  replacement.respond({
    jsonrpc: "2.0",
    id,
    result: ["new"],
  });
  assert.deepEqual(await pending, ["new"]);
  assert.deepEqual(client.status().events, ["backend_write_rejected", "backend_notification"]);
});
