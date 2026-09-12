import assert from "node:assert/strict";
import { it } from "node:test";
import {
  assertFailedAfterShutdown,
  assertNoGenericNotificationRoute,
  completeReadOnlyShutdown,
  FakeProcess,
  ready,
} from "../testing/direct-lsp/direct-lsp-test-support.js";

it("opens each protected file URI \
once without generic file access", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);

  client.openProtectedDocument("file:///frozen/a.rs", {
    language_id: "rust",
    bytes: "fn main() {}\n",
  });
  client.openProtectedDocument("file:///frozen/a.rs", {
    language_id: "rust",
    bytes: "changed",
  });

  assert.equal(process.sent.at(-1)?.method, "textDocument/didOpen");
  assert.equal(
    process.sent.filter((message) => message.method === "textDocument/didOpen")
      .length,
    1,
  );
  assertNoGenericNotificationRoute(client);
  assert.throws(
    () =>
      client.openProtectedDocument("https://example.test/a.rs", {
        language_id: "rust",
        bytes: "x",
      }),
    { code: "backend_write_rejected" },
  );
});

it("uses frozen initialization and a framed read-only request", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);
  await completeReadOnlyShutdown(client, process);
  await assertFailedAfterShutdown(client, process);
});
