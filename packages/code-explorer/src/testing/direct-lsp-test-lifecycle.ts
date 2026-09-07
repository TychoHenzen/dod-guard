import { createDirectLspClient } from "../semantic/direct-lsp/direct-lsp.js";
import { FakeProcess } from "./direct-lsp-test-process.js";
import { Scheduler } from "./direct-lsp-test-scheduler.js";

export async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export async function ready(
  process: FakeProcess,
  scheduler = new Scheduler(),
): Promise<{ client: ReturnType<typeof createDirectLspClient>; scheduler: Scheduler }> {
  const client = createDirectLspClient({
    language: "python",
    root_uri: "file:///frozen",
    capabilities: { workspace: {} },
    safe_initialization_options: { safe: true },
    request_timeout_ms: 10,
    scheduler,
  });
  const start = client.start(process);
  const initialize = process.sent[0] as { id: number };
  process.respond({ jsonrpc: "2.0", id: initialize.id, result: { capabilities: {} } }, true);
  await start;
  return { client, scheduler };
}
