import assert from "node:assert/strict";
import type {
  createDirectLspClient,
} from "../semantic/direct-lsp/direct-lsp.js";
import { FakeProcess } from "./direct-lsp-test-process.js";

export async function assertFailedAfterShutdown(
  client: ReturnType<typeof createDirectLspClient>,
  process: FakeProcess,
): Promise<void> {
  assert.deepEqual(client.status().restart_delays_ms, []);
  assert.equal(client.status().state, "failed");
  await assert.rejects(client.request("textDocument/definition", {}), {
    code: "backend_failed",
  });
  process.respond({
    jsonrpc: "2.0",
    method: "window/logMessage",
    params: { ignored: true },
  });
  assert.deepEqual(client.status().events, []);
}

export function assertNoGenericNotificationRoute(
  client: ReturnType<typeof createDirectLspClient>,
): void {
  assert.equal("notify" in client, false);
  assert.throws(
    () =>
      (
        client as unknown as { notify(method: string, params: unknown): void }
      ).notify("textDocument/didChange", {}),
    TypeError,
  );
  assert.throws(
    () =>
      (
        client as unknown as { notify(method: string, params: unknown): void }
      ).notify("unknown/outbound", {}),
    TypeError,
  );
}
