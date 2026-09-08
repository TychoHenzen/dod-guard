import { createDirectLspClient } from "../../semantic/direct-lsp/direct-lsp.js";
import { FakeProcess } from "./direct-lsp-test-process.js";
import { Scheduler } from "./direct-lsp-test-scheduler.js";
import { tick } from "./direct-lsp-test-lifecycle.js";

export async function oldProcessFixture() {
  const scheduler = new Scheduler();
  const old = new FakeProcess();
  const replacement = new FakeProcess();
  let launch = 0;
  const client = createDirectLspClient({
    root_uri: "file:///frozen",
    capabilities: {},
    safe_initialization_options: {},
    scheduler,
    restart: () => (launch++ === 0 ? replacement : undefined),
    request_timeout_ms: 10,
  });
  const initial = client.start(old);
  old.respond({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
  await initial;
  old.respond({
    jsonrpc: "2.0",
    id: 55,
    method: "workspace/applyEdit",
    params: { secret: "discard" },
  });
  old.respond({
    jsonrpc: "2.0",
    method: "window/logMessage",
    params: { secret: "discard" },
  });
  old.crash();
  scheduler.advance(250);
  replacement.respond({ jsonrpc: "2.0", id: 2, result: { capabilities: {} } });
  await tick();
  const pending = client.request("textDocument/definition", {});
  const id = (replacement.sent.at(-1) as { id: number }).id;
  return { client, old, replacement, pending, id };
}

export async function restartFixture() {
  const scheduler = new Scheduler();
  const first = new FakeProcess();
  const second = new FakeProcess();
  const third = new FakeProcess();
  const replacements = [second, third];
  const client = createDirectLspClient({
    root_uri: "file:///frozen",
    capabilities: {},
    safe_initialization_options: {},
    scheduler,
    restart: () => replacements.shift(),
    request_timeout_ms: 10,
  });
  const started = client.start(first);
  first.respond({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
  await started;
  first.crash();
  scheduler.advance(250);
  second.respond({ jsonrpc: "2.0", id: 2, result: { capabilities: {} } });
  await tick();
  second.crash();
  scheduler.advance(1_000);
  third.respond({ jsonrpc: "2.0", id: 3, result: { capabilities: {} } });
  await tick();
  third.crash();
  return client;
}
