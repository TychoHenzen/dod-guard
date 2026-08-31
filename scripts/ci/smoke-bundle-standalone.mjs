#!/usr/bin/env node

// smoke-bundle-standalone - run every packaged bundle with no repository
// node_modules available to resolve external dependencies. Package-root JSON
// records copied beside each bundle are expected runtime metadata, not a
// dependency installation or plugin cache.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES_DIR = join(ROOT, "packages");
const TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2025-06-18";

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

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
  const child = spawn(process.execPath, [bundle], {
    cwd: dirname(bundle),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const state = { waiters: new Map(), junk: [] };
  let exited = false;
  child.on("close", () => {
    exited = true;
  });
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
        `serverInfo.version is ${JSON.stringify(serverVersion)} but package.json says ${JSON.stringify(expectedVersion)}`,
      );
    }

    send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
    if (init.result?.capabilities?.tools) {
      send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const listed = await Promise.race([awaitResponse(state, 2), died, timeout]);
      if (listed.error) throw new Error(`tools/list failed: ${JSON.stringify(listed.error)}`);
    }
    if (state.junk.length > 0) throw new Error(`non-JSON output on stdout corrupts the MCP stream: ${state.junk[0]}`);
  } finally {
    if (!exited) {
      child.kill();
      await once(child, "close");
    }
  }
}

export async function discoverBundles() {
  const entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
  const bundles = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageDir = join(PACKAGES_DIR, entry.name);
    const pluginManifest = join(packageDir, ".claude-plugin", "plugin.json");
    const bundle = join(packageDir, "dist", "bundle.js");
    try {
      await Promise.all([stat(bundle), stat(pluginManifest)]);
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
    const manifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
    bundles.push({
      name: manifest.name,
      version: manifest.version,
      path: bundle,
      manifest: join(packageDir, "package.json"),
    });
  }
  return bundles.sort((left, right) => left.name.localeCompare(right.name));
}

function hasNodeModulesAncestor(path) {
  let current = resolve(path);
  while (true) {
    if (current.split(/[\\/]/).includes("node_modules")) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

export async function runBundles(bundles) {
  if (bundles.length === 0) {
    process.stderr.write("no package bundles found\n");
    return 1;
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "mcp-standalone-"));
  const failures = [];
  try {
    if (hasNodeModulesAncestor(tempRoot)) {
      throw new Error(`temporary directory has a node_modules ancestor: ${tempRoot}`);
    }
    for (const bundle of bundles) {
      const isolatedPackage = join(tempRoot, bundle.name);
      const isolatedBundle = join(isolatedPackage, "dist", "bundle.js");
      await mkdir(dirname(isolatedBundle), { recursive: true });
      await cp(bundle.path, isolatedBundle);
      const sourcePackage = dirname(bundle.manifest);
      const runtimeMetadata = await readdir(sourcePackage, { withFileTypes: true });
      await Promise.all(
        runtimeMetadata
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => cp(join(sourcePackage, entry.name), join(isolatedPackage, entry.name))),
      );
      try {
        await handshake(isolatedBundle, bundle.name, bundle.version);
        process.stdout.write(`standalone smoke OK - ${bundle.name}\n`);
      } catch (err) {
        failures.push(`${bundle.name}: ${err.message}`);
        process.stdout.write(`standalone smoke FAILED - ${bundle.name}\n  ${err.message}\n`);
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    process.stderr.write(`standalone bundle smoke failed for ${failures.length} package(s)\n`);
    return 1;
  }
  return 0;
}

async function main() {
  return runBundles(await discoverBundles());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .catch((err) => {
      process.stderr.write(`standalone bundle smoke error: ${err.message}\n`);
      process.exitCode = 1;
    })
    .then((code) => {
      if (code !== undefined) process.exitCode = code;
    });
}
