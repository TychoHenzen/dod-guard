import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type { LspProcess } from "../direct-lsp/direct-lsp.js";
import { ownedResources } from "../workspace/owned-resources.js";

/**
 * Spawns only a prevalidated executable and fixed arguments without a shell.
 */
export function spawnNativeLspProcess(
  executable: string,
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>>,
): LspProcess {
  ownedResources.assertOpen();
  const child = spawn(executable, arguments_, {
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
    // Do not inherit project-controlled PATH, Python, or package settings.
    // The policy has already selected an absolute executable and arguments.
    env: { ...environment },
  }) as ChildProcessByStdio<Writable, Readable, null>;
  // A backend that exits or closes its stdin turns pending writes into EPIPE
  // (EOF on Windows). The exit listener and request timeouts own failure
  // handling, so the stream error must not become an uncaught exception.
  child.stdin.on("error", () => undefined);
  const forget = ownedResources.trackChild(() => {
    child.kill("SIGKILL");
  });
  child.once("exit", forget);
  return createProcessHandlers(child);
}

function createProcessHandlers(
  child: ChildProcessByStdio<Writable, Readable, null>,
): LspProcess {
  const write = (chunk: Uint8Array): void => {
    child.stdin.write(chunk);
  };
  const onStdout = (listener: (chunk: Uint8Array) => void): void => {
    child.stdout.on("data", (chunk: Buffer) => listener(new Uint8Array(chunk)));
  };
  const onExit = (listener: () => void): void => {
    child.once("exit", listener);
  };
  const onError = (listener: () => void): void => {
    child.once("error", listener);
  };
  const kill = (): void => {
    child.stdin.destroy();
    child.kill();
  };
  return {
    write,
    onStdout,
    onExit,
    onError,
    kill,
  };
}
