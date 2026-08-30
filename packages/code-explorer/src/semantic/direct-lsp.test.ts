import assert from "node:assert/strict";
import { it } from "node:test";
import { createDirectLspClient, type DirectLspScheduler, type LspProcess } from "./direct-lsp.js";

class Scheduler implements DirectLspScheduler {
  time = 0;
  private next = 0;
  private tasks = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  setTimeout(callback: () => void, delayMs: number): number {
    const id = ++this.next;
    this.tasks.set(id, { due: this.time + delayMs, callback });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }
  advance(milliseconds: number): void {
    this.time += milliseconds;
    for (;;) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= this.time)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!due) return;
      this.tasks.delete(due[0]);
      due[1].callback();
    }
  }
}

class FakeProcess implements LspProcess {
  sent: Record<string, unknown>[] = [];
  killed = false;
  private stdout: Array<(chunk: Uint8Array) => void> = [];
  private exits: Array<() => void> = [];
  write(chunk: Uint8Array): void {
    this.sent.push(decode(chunk) as Record<string, unknown>);
  }
  onStdout(listener: (chunk: Uint8Array) => void): void {
    this.stdout.push(listener);
  }
  onExit(listener: () => void): void {
    this.exits.push(listener);
  }
  kill(): void {
    this.killed = true;
    this.crash();
  }
  respond(value: unknown, fragmented = false): void {
    const frame = encode(value);
    if (fragmented) {
      for (const listener of this.stdout) {
        listener(frame.slice(0, 7));
        listener(frame.slice(7));
      }
    } else for (const listener of this.stdout) listener(frame);
  }
  emit(value: Uint8Array): void {
    for (const listener of this.stdout) listener(value);
  }
  crash(): void {
    for (const listener of this.exits) listener();
  }
}

function encode(value: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(value));
  return new TextEncoder().encode(`Content-Length: ${body.length}\r\n\r\n${new TextDecoder().decode(body)}`);
}
function decode(frame: Uint8Array): unknown {
  const value = new TextDecoder().decode(frame);
  const boundary = value.indexOf("\r\n\r\n");
  assert.match(value.slice(0, boundary), /^Content-Length: [0-9]+$/);
  return JSON.parse(value.slice(boundary + 4));
}
async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
async function ready(process: FakeProcess, scheduler = new Scheduler()) {
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

// covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP backend starts and stops normally
it("uses frozen initialization and a framed read-only request then shuts down without restart", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);
  assert.deepEqual(process.sent[0], {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: null,
      rootUri: "file:///frozen",
      capabilities: { workspace: {} },
      initializationOptions: { safe: true },
    },
  });
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
    ["initialize", "initialized", "textDocument/definition", "shutdown", "exit"],
  );
  assert.deepEqual(client.status().restart_delays_ms, []);
  assert.equal(client.status().state, "failed");
  await assert.rejects(client.request("textDocument/definition", {}), { code: "backend_failed" });
  process.respond({ jsonrpc: "2.0", method: "window/logMessage", params: { ignored: true } });
  assert.deepEqual(client.status().events, []);
});

it("retains initialize capabilities and answers only safe Python configuration requests", async () => {
  const process = new FakeProcess();
  const client = createDirectLspClient({
    language: "python",
    root_uri: "file:///frozen",
    capabilities: {},
    safe_initialization_options: {},
  });
  const start = client.start(process);
  const initialize = process.sent[0] as { id: number };
  process.respond({ jsonrpc: "2.0", id: initialize.id, result: { capabilities: { definitionProvider: true } } });
  await start;
  assert.deepEqual(client.status().server_capabilities, { definitionProvider: true });
  process.respond({
    jsonrpc: "2.0",
    id: 7,
    method: "workspace/configuration",
    params: { items: [{ section: "python.pythonPath" }, { section: "other" }] },
  });
  assert.deepEqual(process.sent.at(-1), { jsonrpc: "2.0", id: 7, result: [[], null] });
});

it("snapshots client capabilities and safe initialization options before process startup", async () => {
  const process = new FakeProcess();
  const capabilities = { workspace: { configuration: true } };
  const safe = { cargo: { buildScripts: false } };
  const client = createDirectLspClient({
    root_uri: "file:///frozen",
    capabilities,
    safe_initialization_options: safe,
    scheduler: new Scheduler(),
  });
  capabilities.workspace.configuration = false;
  safe.cargo.buildScripts = true;
  const start = client.start(process);
  process.respond({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
  await start;
  assert.deepEqual(process.sent[0].params, {
    processId: null,
    rootUri: "file:///frozen",
    capabilities: { workspace: { configuration: true } },
    initializationOptions: { cargo: { buildScripts: false } },
  });
});

// covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP response is malformed or oversized
it("terminates on malformed, non-ASCII, incomplete, invalid, and oversized frames", async () => {
  for (const invalid of [
    new TextEncoder().encode("Content-Length: 2\n\n{}"),
    new Uint8Array([
      67, 111, 110, 116, 101, 110, 116, 45, 76, 101, 110, 103, 116, 104, 58, 32, 49, 128, 13, 10, 13, 10, 123,
    ]),
    encode({ jsonrpc: "2.0", id: 0, result: [] }),
    encode({ jsonrpc: "2.0", id: 2, result: "x".repeat(1024 * 1024) }),
  ]) {
    const process = new FakeProcess();
    const { client } = await ready(process);
    const pending = client.request("textDocument/definition", {});
    process.emit(invalid);
    await assert.rejects(pending, { code: "backend_failed" });
    assert.equal(process.killed, true);
    assert.equal(client.status().state, "failed");
  }
  const incomplete = new FakeProcess();
  const { client: incompleteClient } = await ready(incomplete);
  const incompletePending = incompleteClient.request("textDocument/definition", {});
  incomplete.emit(new TextEncoder().encode("Content-Length: 4\r\n\r\n{"));
  incomplete.crash();
  await assert.rejects(incompletePending, { code: "backend_failed" });
  assert.equal(incomplete.killed, true);
});

// covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP request times out
it("cancels timeouts, rejects writes locally, and ignores late results from the timed-out epoch", async () => {
  const process = new FakeProcess();
  const { client, scheduler } = await ready(process);
  const pending = client.request("textDocument/references", {});
  const id = (process.sent.at(-1) as { id: number }).id;
  scheduler.advance(10);
  await assert.rejects(pending, { code: "backend_timeout" });
  assert.deepEqual(process.sent.at(-1), { jsonrpc: "2.0", method: "$/cancelRequest", params: { id } });
  process.respond({ jsonrpc: "2.0", id, result: ["late"] });
  assert.equal(client.status().state, "ready");
  await assert.rejects(client.request("workspace/executeCommand", {}), { code: "backend_write_rejected" });
});

it("force terminates after two semantic timeouts and rejects other in-flight work", async () => {
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
  process.respond({ jsonrpc: "2.0", id: lateId, result: ["late"] });
  assert.equal(client.status().state, "failed");
});

// covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: LSP backend crashes repeatedly
it("restarts actual replacement processes at 250ms and 1s then requires explicit refresh", async () => {
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
  assert.deepEqual(client.status().restart_delays_ms, [250, 1_000]);
  assert.equal(client.status().state, "unavailable");
  client.refresh();
  assert.equal(client.status().state, "initializing");
});

// covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: Backend dynamically registers a write method
it("rejects every dynamic registration without accepting its requested method", async () => {
  const process = new FakeProcess();
  const { client } = await ready(process);
  process.respond({
    jsonrpc: "2.0",
    id: 90,
    method: "client/registerCapability",
    params: { registrations: [{ method: "workspace/executeCommand" }] },
  });
  assert.deepEqual(process.sent.at(-1), {
    jsonrpc: "2.0",
    id: 90,
    error: { code: -32601, message: "Method not found" },
  });
  assert.deepEqual(client.status().events, ["backend_capability_rejected"]);
  process.respond({ jsonrpc: "2.0", id: "backend-request", method: "client/registerCapability", params: {} });
  assert.deepEqual(process.sent.at(-1), {
    jsonrpc: "2.0",
    id: "backend-request",
    error: { code: -32601, message: "Method not found" },
  });
});

// covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: Backend ignores cancellation or shutdown
it("force terminates ignored shutdown and counts initialization failures in the same restart budget", async () => {
  const process = new FakeProcess();
  const { client, scheduler } = await ready(process);
  const stop = client.shutdown();
  scheduler.advance(5_000);
  await tick();
  scheduler.advance(5_000);
  await stop;
  assert.equal(process.killed, true);
  assert.deepEqual(client.status().restart_delays_ms, [250]);
  const bad = new FakeProcess();
  const badScheduler = new Scheduler();
  const badClient = createDirectLspClient({
    root_uri: "file:///frozen",
    capabilities: {},
    safe_initialization_options: {},
    scheduler: badScheduler,
  });
  const start = badClient.start(bad);
  bad.respond({ jsonrpc: "2.0", id: 1, result: {} });
  await assert.rejects(start, { code: "backend_failed" });
  assert.deepEqual(badClient.status().restart_delays_ms, [250]);
});

// covers: code-explorer/language-adapters :: Direct LSP adapters follow one bounded process lifecycle :: Backend sends an unsolicited request
it("rejects unsolicited requests, discards allowed notification payloads, and ignores old-process output", async () => {
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
  old.respond({ jsonrpc: "2.0", id: 55, method: "workspace/applyEdit", params: { secret: "discard" } });
  old.respond({ jsonrpc: "2.0", method: "window/logMessage", params: { secret: "discard" } });
  old.crash();
  scheduler.advance(250);
  replacement.respond({ jsonrpc: "2.0", id: 2, result: { capabilities: {} } });
  await tick();
  const pending = client.request("textDocument/definition", {});
  const id = (replacement.sent.at(-1) as { id: number }).id;
  old.respond({ jsonrpc: "2.0", id, result: ["old"] });
  replacement.respond({ jsonrpc: "2.0", id, result: ["new"] });
  assert.deepEqual(await pending, ["new"]);
  assert.deepEqual(client.status().events, ["backend_write_rejected", "backend_notification"]);
});
