import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LspProcess } from "../semantic/direct-lsp/direct-lsp.js";
import {
  createNativeProjectRoot,
} from "../semantic/project-root/project-root.js";
import {
  createManagedPythonBackend,
} from "../semantic/runtime/runtime-bootstrap.js";
import {
  runtimeOptions,
  unavailableCapabilities,
} from "./runtime-lsp-test-support.js";

class InitializingProcess implements LspProcess {
  sent: Record<string, unknown>[] = [];
  private stdout: ((chunk: Uint8Array) => void) | undefined;
  private exit: (() => void) | undefined;
  write(chunk: Uint8Array): void {
    const text = new TextDecoder().decode(chunk);
    const message = JSON.parse(
      text.slice(text.indexOf("\r\n\r\n") + 4),
    ) as Record<string, unknown>;
    this.sent.push(message);
    if (message.method === "initialize")
      this.respond({ capabilities: {} }, message.id);
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
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    });
    this.stdout?.(
      new TextEncoder().encode(`Content-Length: ${body.length}\r\n\r\n${body}`),
    );
  }
}

function createFixtureSource(): string {
  const source = mkdtempSync(join(tmpdir(), "code-explorer-managed-python-"));
  mkdirSync(join(source, "src"));
  writeFileSync(join(source, "src", "main.py"), "def helper():\n    pass\n");
  return source;
}

function recordPythonRoot(child: InitializingProcess, roots: string[]): void {
  const initialize = child.sent.find(
    (message) => message.method === "initialize",
  )?.params as { rootUri?: string } | undefined;
  roots[roots.length - 1] = initialize?.rootUri ?? "";
}

function pythonWriter(
  write: (chunk: Uint8Array) => void,
  child: InitializingProcess,
  roots: string[],
) {
  return (chunk: Uint8Array) => {
    write(chunk);
    recordPythonRoot(child, roots);
  };
}

function spawnPythonProcess(roots: string[]): LspProcess {
  const child = new InitializingProcess();
  roots.push("");
  const write = child.write.bind(child);
  child.write = pythonWriter(write, child, roots);
  return child;
}

function createPythonSpawn(roots: string[]) {
  return () => spawnPythonProcess(roots);
}

function createPythonPolicy() {
  const runtime = runtimeOptions(new InitializingProcess());
  return {
    prepare: () => ({ ...runtime.prepare(), executable: "fake" }),
    confirmInitialized: runtime.confirmInitialized,
  };
}

async function exerciseManagedPython(
  source: string,
  roots: string[],
): Promise<void> {
  const backend = createManagedPythonBackend({
    projectRoot: createNativeProjectRoot(source),
    policy: createPythonPolicy(),
    capabilities: unavailableCapabilities,
    options: { symbols: new Map(), spawn: createPythonSpawn(roots) },
  });
  await backend.start?.();
  await new Promise((resolve) => setImmediate(resolve));
  writeFileSync(
    join(source, "src", "main.py"),
    "def helper():\n    return 1\n",
  );
  await backend.refresh?.();
  await new Promise((resolve) => setImmediate(resolve));
  await backend.shutdown?.();
}

export async function managedPythonRoots(): Promise<{
  roots: string[];
  source: string;
}> {
  const source = createFixtureSource();
  const roots: string[] = [];
  try {
    await exerciseManagedPython(source, roots);
    return { roots, source };
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
}
