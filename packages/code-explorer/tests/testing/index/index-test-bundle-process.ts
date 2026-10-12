import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

const handshakeTimeoutMs = 5_000;

export type BundleExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  at: number;
};

export type SpawnedBundle = {
  child: ChildProcessWithoutNullStreams;
  exited: Promise<BundleExit>;
  stderr(): string;
};

export function bundlePath(): string {
  return fileURLToPath(new URL("../../../../dist/bundle.js", import.meta.url));
}

export function spawnBundle(input: {
  project: string;
  env: Record<string, string>;
}): SpawnedBundle {
  const child = spawn(
    process.execPath,
    [bundlePath(), "--project-root", input.project],
    { cwd: input.project, env: input.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    errors += chunk;
  });
  const exited = new Promise<BundleExit>((resolve) => {
    child.once("exit", (code, signal) => {
      resolve({ code, signal, at: performance.now() });
    });
  });
  return { child, exited, stderr: () => errors };
}

export async function completeHandshake(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const answered = waitForStdout(child, '"id":1');
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "exit-test", version: "1.0.0" },
      },
    })}\n`,
  );
  await answered;
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );
}

/** Kills a bundle that is still running, so its directories can be removed. */
export async function stopBundle(bundle: SpawnedBundle): Promise<void> {
  if (bundle.child.exitCode === null && bundle.child.signalCode === null)
    bundle.child.kill("SIGKILL");
  await bundle.exited;
}

function waitForStdout(
  child: ChildProcessWithoutNullStreams,
  marker: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      if (error) reject(error);
      else resolve();
    };
    const onData = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.includes(marker)) finish();
    };
    const timer = setTimeout(
      () => finish(new Error("bundle_handshake_timeout")),
      handshakeTimeoutMs,
    );
    child.stdout.on("data", onData);
  });
}
