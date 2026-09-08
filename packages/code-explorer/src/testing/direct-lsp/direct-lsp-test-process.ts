import type { LspProcess } from "../../semantic/direct-lsp/direct-lsp.js";
import { decode, encode } from "./direct-lsp-test-encoding.js";

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
