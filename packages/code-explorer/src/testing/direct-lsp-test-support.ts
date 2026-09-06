import assert from "node:assert/strict";
import type { DirectLspScheduler, LspProcess } from "../semantic/direct-lsp/direct-lsp.js";
import { createDirectLspClient } from "../semantic/direct-lsp/direct-lsp.js";

export class Scheduler implements DirectLspScheduler {
  time = 0;
  private next = 0;
  private tasks = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  setTimeout(callback: () => void, delayMs: number): number {
    const id = ++this.next;
    this.tasks.set(id, {
      due: this.time + delayMs,
      callback,
    });
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

export class FakeProcess implements LspProcess {
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
    if (!fragmented) {
      for (const listener of this.stdout) listener(frame);
      return;
    }
    for (const listener of this.stdout) {
      listener(frame.slice(0, 7));
      listener(frame.slice(7));
    }
  }
  emit(value: Uint8Array): void {
    for (const listener of this.stdout) listener(value);
  }
  crash(): void {
    for (const listener of this.exits) listener();
  }
}

export function encode(value: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(value));
  return new TextEncoder().encode(
    `Content-Length: ${body.length}\r\n\r\n${new TextDecoder().decode(body)}`,
  );
}

export async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export async function ready(
  process: FakeProcess,
  scheduler = new Scheduler(),
): Promise<{
  client: ReturnType<typeof createDirectLspClient>;
  scheduler: Scheduler;
}> {
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
  process.respond(
    {
      jsonrpc: "2.0",
      id: initialize.id,
      result: { capabilities: {} },
    },
    true,
  );
  await start;
  return { client, scheduler };
}

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
        client as unknown as {
          notify(method: string, params: unknown): void;
        }
      ).notify("textDocument/didChange", {}),
    TypeError,
  );
  assert.throws(
    () =>
      (
        client as unknown as {
          notify(method: string, params: unknown): void;
        }
      ).notify("unknown/outbound", {}),
    TypeError,
  );
}

export function assertPythonConfiguration(process: FakeProcess): void {
  assert.deepEqual(process.sent[2], {
    jsonrpc: "2.0",
    method: "workspace/didChangeConfiguration",
    params: {
      settings: {
        python: {
          analysis: {
            diagnosticMode: "workspace",
            indexing: true,
            useLibraryCodeForTypes: false,
          },
        },
      },
    },
  });
  process.respond({
    jsonrpc: "2.0",
    id: 7,
    method: "workspace/configuration",
    params: {
      items: [{ section: "python.pythonPath" }, { section: "other" }],
    },
  });
  assert.deepEqual(process.sent.at(-1), {
    jsonrpc: "2.0",
    id: 7,
    result: [[], null],
  });
}

export async function completeReadOnlyShutdown(
  client: ReturnType<typeof createDirectLspClient>,
  process: FakeProcess,
): Promise<void> {
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
    [
      "initialize",
      "initialized",
      "workspace/didChangeConfiguration",
      "textDocument/definition",
      "shutdown",
      "exit",
    ],
  );
}

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
  old.respond({
    jsonrpc: "2.0",
    id: 1,
    result: { capabilities: {} },
  });
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
  replacement.respond({
    jsonrpc: "2.0",
    id: 2,
    result: { capabilities: {} },
  });
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
  first.respond({
    jsonrpc: "2.0",
    id: 1,
    result: { capabilities: {} },
  });
  await started;
  first.crash();
  scheduler.advance(250);
  second.respond({
    jsonrpc: "2.0",
    id: 2,
    result: { capabilities: {} },
  });
  await tick();
  second.crash();
  scheduler.advance(1_000);
  third.respond({
    jsonrpc: "2.0",
    id: 3,
    result: { capabilities: {} },
  });
  await tick();
  third.crash();
  return client;
}

function decode(frame: Uint8Array): unknown {
  const value = new TextDecoder().decode(frame);
  const boundary = value.indexOf("\r\n\r\n");
  return JSON.parse(value.slice(boundary + 4));
}
