import { spawn } from "node:child_process";
import type { LspProcess } from "./direct-lsp.js";

/** Spawns only a prevalidated executable and fixed arguments without a shell. */
export function spawnNativeLspProcess(
  executable: string,
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>>,
): LspProcess {
  const child = spawn(executable, arguments_, {
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
    // Do not inherit project-controlled PATH, Python, or package settings.
    // The policy has already selected an absolute executable and arguments.
    env: { ...environment },
  });
  return {
    write(chunk) {
      child.stdin.write(chunk);
    },
    onStdout(listener) {
      child.stdout.on("data", (chunk: Buffer) => listener(new Uint8Array(chunk)));
    },
    onExit(listener) {
      child.once("exit", listener);
    },
    onError(listener) {
      child.once("error", listener);
    },
    kill() {
      child.stdin.destroy();
      child.kill();
    },
  };
}
