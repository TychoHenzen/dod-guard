import assert from "node:assert/strict";
import type { createDirectLspClient } from "../../semantic/direct-lsp/direct-lsp.js";
import { tick } from "./direct-lsp-test-lifecycle.js";
import type { FakeProcess } from "./direct-lsp-test-process.js";

const shutdownInitialization = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: null,
    rootUri: "file:///frozen",
    capabilities: { workspace: {} },
    initializationOptions: { safe: true },
  },
};

const shutdownMethods = [
  "initialize",
  "initialized",
  "workspace/didChangeConfiguration",
  "textDocument/definition",
  "shutdown",
  "exit",
];

export async function completeReadOnlyShutdown(
  client: ReturnType<typeof createDirectLspClient>,
  process: FakeProcess,
): Promise<void> {
  assert.deepEqual(process.sent[0], shutdownInitialization);
  const call = client.request("textDocument/definition", {});
  const request = process.sent.at(-1) as { id: number };
  process.respond({ jsonrpc: "2.0", id: request.id, result: [] });
  await call;
  const stop = client.shutdown();
  const shutdown = process.sent.at(-1) as { id: number };
  process.respond({ jsonrpc: "2.0", id: shutdown.id, result: null });
  await tick();
  process.crash();
  await stop;
  assert.deepEqual(
    process.sent.map((entry) => entry.method),
    shutdownMethods,
  );
}
