import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import type { LspProcess } from "./direct-lsp.js";
import { createNativeProjectRoot } from "./project-root.js";
import { createManagedPythonBackend } from "./runtime-bootstrap.js";

class InitializingProcess implements LspProcess {
  sent: Record<string, unknown>[] = [];
  private stdout: ((chunk: Uint8Array) => void) | undefined;
  private exit: (() => void) | undefined;
  write(chunk: Uint8Array): void {
    const text = new TextDecoder().decode(chunk);
    const message = JSON.parse(text.slice(text.indexOf("\r\n\r\n") + 4)) as Record<string, unknown>;
    this.sent.push(message);
    if (message.method === "initialize") this.respond({ capabilities: {} }, message.id);
    if (message.method === "shutdown") this.respond(null, message.id);
    if (message.method === "exit") this.exit?.();
  }
  onStdout(listener: (chunk: Uint8Array) => void): void {
    this.stdout = listener;
  }
  onExit(listener: () => void): void {
    this.exit = listener;
  }
  kill(): void {
    this.exit?.();
  }
  private respond(result: unknown, id: unknown): void {
    const body = JSON.stringify({ jsonrpc: "2.0", id, result });
    this.stdout?.(new TextEncoder().encode(`Content-Length: ${body.length}\r\n\r\n${body}`));
  }
}

it("managed Python construction gives the process only a monotonic immutable mirror root", async () => {
  const source = mkdtempSync(join(tmpdir(), "code-explorer-managed-python-"));
  mkdirSync(join(source, "src"));
  writeFileSync(join(source, "src", "main.py"), "def helper():\n    pass\n");
  const roots: string[] = [];
  const spawn = (): LspProcess => {
    const child = new InitializingProcess();
    roots.push("");
    const write = child.write.bind(child);
    child.write = (chunk) => {
      write(chunk);
      const initialize = child.sent.find((message) => message.method === "initialize")?.params as
        | { rootUri?: string }
        | undefined;
      roots[roots.length - 1] = initialize?.rootUri ?? "";
    };
    return child;
  };
  const policy = {
    prepare: () => ({ status: "ready" as const, executable: "fake", arguments: [], environment: {} }),
    confirmInitialized: () => ({ status: "ready" as const }),
  };
  try {
    const backend = createManagedPythonBackend(createNativeProjectRoot(source), policy as never, {}, {} as never, {
      symbols: new Map(),
      spawn,
    });
    await backend.start?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(roots[0] ?? "", /code-explorer-pyright-.*generation-0/);
    assert.equal(roots[0].includes(source.replaceAll("\\", "/")), false);

    writeFileSync(join(source, "src", "main.py"), "def helper():\n    return 1\n");
    await backend.refresh?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(roots[1] ?? "", /code-explorer-pyright-.*generation-1/);
    assert.equal(roots[1].includes(source.replaceAll("\\", "/")), false);
    await backend.shutdown?.();
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
});
