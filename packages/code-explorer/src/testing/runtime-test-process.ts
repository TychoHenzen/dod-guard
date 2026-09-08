import type { LspProcess } from "../semantic/direct-lsp/direct-lsp.js";

export class Process implements LspProcess {
  readonly events: string[];
  readonly sent: Array<{ id?: number; method?: string; params?: unknown }> = [];
  private stdout: ((chunk: Uint8Array) => void)[] = [];
  private exit: (() => void)[] = [];
  private errors: (() => void)[] = [];
  ignoreShutdown = false;
  ignoreExit = false;

  constructor(
    events: string[],
    private readonly serverCapabilities: Record<string, unknown> = {},
    private readonly responseFor?: (method: string, params: unknown) => unknown,
  ) {
    this.events = events;
  }

  write(chunk: Uint8Array): void {
    const message = JSON.parse(
      new TextDecoder().decode(chunk).split("\r\n\r\n")[1] ?? "{}",
    ) as {
      id?: number;
      method?: string;
      params?: unknown;
    };
    this.sent.push(message);
    this.respondToInitialize(message);
    this.respondToShutdown(message);
    this.recordExit(message);
    this.respondToRequest(message);
  }

  private respondToInitialize(message: { id?: number; method?: string }): void {
    if (message.method !== "initialize") return;
    this.respond({
      jsonrpc: "2.0",
      id: message.id,
      result: { capabilities: this.serverCapabilities },
    });
  }

  private respondToShutdown(message: { id?: number; method?: string }): void {
    if (message.method !== "shutdown" || this.ignoreShutdown) return;
    this.respond({ jsonrpc: "2.0", id: message.id, result: null });
  }

  private recordExit(message: { method?: string }): void {
    if (message.method !== "exit" || this.ignoreExit) return;
    this.events.push("exit");
    for (const listener of this.exit) listener();
  }

  private respondToRequest(message: {
    id?: number;
    method?: string;
    params?: unknown;
  }): void {
    if (
      message.id === undefined ||
      message.method === undefined ||
      this.responseFor === undefined ||
      message.method === "initialize"
    )
      return;
    this.respond({
      jsonrpc: "2.0",
      id: message.id,
      result: this.responseFor(message.method, message.params),
    });
  }

  onStdout(listener: (chunk: Uint8Array) => void): void {
    this.stdout.push(listener);
  }

  onExit(listener: () => void): void {
    this.exit.push(listener);
  }

  onError(listener: () => void): void {
    this.errors.push(listener);
  }

  kill(): void {
    this.events.push("kill");
    for (const listener of this.exit) listener();
  }

  error(): void {
    for (const listener of this.errors) listener();
  }

  private respond(value: unknown): void {
    const body = JSON.stringify(value);
    const frame = new TextEncoder().encode(
      `Content-Length: ${body.length}\r\n\r\n${body}`,
    );
    for (const listener of this.stdout) listener(frame);
  }
}
