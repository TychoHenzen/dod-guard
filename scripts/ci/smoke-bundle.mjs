#!/usr/bin/env node
// smoke-bundle — start a packaged bundle and complete a real MCP handshake.
//
// tsc and node --test both run against dist/*.js, never against the esbuild
// bundle users actually execute. A wrongly-externalized dependency or a broken
// banner only shows up here: the server must initialize and answer tools/list,
// even for a CLI-first package like dod-guard that registers zero tools.
//
// Usage: node scripts/ci/smoke-bundle.mjs <package-name>
//
// Exit codes:
//   0  server initialized and answered tools/list
//   1  server failed to start or answer
//   3  usage error

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2025-06-18";

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

/** Collect newline-delimited JSON-RPC responses until the wanted id arrives. */
function awaitResponse(state, id) {
  return new Promise((resolvePromise, rejectPromise) => {
    state.waiters.set(id, { resolvePromise, rejectPromise });
  });
}

function attachStdout(child, state) {
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        state.junk.push(line.slice(0, 200));
        continue;
      }
      const waiter = state.waiters.get(message.id);
      if (waiter) {
        state.waiters.delete(message.id);
        waiter.resolvePromise(message);
      }
    }
  });
}

async function handshake(bundle, pkgName, expectedVersion) {
  const child = spawn(process.execPath, [bundle], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  const state = { waiters: new Map(), junk: [] };
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  attachStdout(child, state);

  const died = new Promise((_, reject) => {
    child.on("exit", (code) =>
      reject(new Error(`server exited early with code ${code}\nstderr: ${stderr.trim() || "(empty)"}`)),
    );
    child.on("error", (err) => reject(new Error(`spawn failed: ${err.message}`)));
  });
  const timeout = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`no response within ${TIMEOUT_MS}ms\nstderr: ${stderr.trim() || "(empty)"}`)),
      TIMEOUT_MS,
    ).unref();
  });

  try {
    send(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "smoke-bundle", version: "1.0.0" },
      },
    });
    const init = await Promise.race([awaitResponse(state, 1), died, timeout]);
    if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
    const serverName = init.result?.serverInfo?.name;
    if (serverName !== pkgName)
      throw new Error(`serverInfo.name is ${JSON.stringify(serverName)}, expected ${JSON.stringify(pkgName)}`);
    const serverVersion = init.result?.serverInfo?.version;
    if (serverVersion !== expectedVersion) {
      throw new Error(
        `serverInfo.version is ${JSON.stringify(serverVersion)} but package.json says ${JSON.stringify(expectedVersion)} — read it from package.json instead of hardcoding`,
      );
    }

    send(child, { jsonrpc: "2.0", method: "notifications/initialized" });

    let tools = [];
    if (init.result?.capabilities?.tools) {
      send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const listed = await Promise.race([awaitResponse(state, 2), died, timeout]);
      if (listed.error) throw new Error(`tools/list failed: ${JSON.stringify(listed.error)}`);
      tools = listed.result?.tools ?? [];
    }
    if (state.junk.length > 0) throw new Error(`non-JSON output on stdout corrupts the MCP stream: ${state.junk[0]}`);
    return { serverName, version: init.result?.serverInfo?.version, tools: tools.map((t) => t.name) };
  } finally {
    child.kill();
  }
}

async function main(argv) {
  const pkgName = argv[0];
  if (!pkgName) {
    process.stderr.write("usage: smoke-bundle.mjs <package-name>\n");
    return 3;
  }
  const bundle = join(ROOT, "packages", pkgName, "dist", "bundle.js");
  if (!existsSync(bundle)) {
    process.stderr.write(`bundle not built: ${bundle}\n`);
    return 3;
  }
  const expectedVersion = JSON.parse(readFileSync(join(ROOT, "packages", pkgName, "package.json"), "utf8")).version;
  try {
    const result = await handshake(bundle, pkgName, expectedVersion);
    process.stdout.write(
      `smoke OK — ${result.serverName} v${result.version} answered initialize and listed ${result.tools.length} tools\n`,
    );
    process.stdout.write(`  tools: ${result.tools.join(", ")}\n`);
  } catch (err) {
    process.stdout.write(`smoke FAILED for ${pkgName}\n  ${err.message}\n`);
    return 1;
  }

  const symlink = join(ROOT, "node_modules", pkgName, "dist", "bundle.js");
  if (existsSync(symlink)) {
    try {
      await handshake(symlink, pkgName, expectedVersion);
      process.stdout.write(`  symlink path OK\n`);
    } catch (err) {
      process.stdout.write(`smoke FAILED for ${pkgName} via symlink path\n  ${err.message}\n`);
      return 1;
    }
  }

  return 0;
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
