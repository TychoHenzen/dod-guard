#!/usr/bin/env node

// Run packaged bundles without repository node_modules.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES_DIR = join(ROOT, "packages");
const TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2025-06-18";
const KNOWLEDGE_BASE_DIR_ENV = "DOD_GUARD_KNOWLEDGE_BASE_DIR";

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function createSyntheticKnowledgeRoot(parent) {
  const root = join(parent, "knowledge-base-vault");
  const entries = join(root, "entries", "smoke", "nested");
  await mkdir(entries, { recursive: true });
  const content = [
    "---",
    "key: smoke.synthetic-entry",
    "title: Synthetic Smoke Entry",
    "chapter: smoke",
    "section: smoke.basics",
    "summary: A generic entry used by the standalone bundle smoke.",
    "sources:",
    "  - label: smoke fixture",
    "    url: https://example.invalid/smoke",
    "---",
    "",
    "Synthetic standalone bundle smoke content.",
  ].join("\n");
  await writeFile(join(entries, "entry.md"), content, "utf8");
  return root;
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

async function requestTool(child, state, died, timeout, id, name, args) {
  send(child, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  const result = await Promise.race([awaitResponse(state, id), died, timeout]);
  if (result.error || result.result?.isError) throw new Error(`${name} failed`);
  return result;
}

function parseToolPayload(result, name) {
  const text = result.result?.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`${name} returned no text`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${name} returned invalid JSON: ${error.message}`);
  }
}

async function handshake(bundle, pkgName, expectedVersion, cwd = dirname(bundle), envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  if (!Object.prototype.hasOwnProperty.call(envOverrides, KNOWLEDGE_BASE_DIR_ENV)) {
    delete env[KNOWLEDGE_BASE_DIR_ENV];
  }
  const child = spawn(process.execPath, [bundle], {
    cwd,
    env,
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
    let tools = [];
    if (init.result?.capabilities?.tools) {
      send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const listed = await Promise.race([awaitResponse(state, 2), died, timeout]);
      if (listed.error) throw new Error(`tools/list failed: ${JSON.stringify(listed.error)}`);
      tools = listed.result?.tools ?? [];
    }
    if (pkgName === "knowledge-base") {
      const expectedTools = [
        "knowledge_list_chapters",
        "knowledge_list_sections",
        "knowledge_list_entries",
        "knowledge_search",
        "knowledge_get_entry",
      ];
      const toolNames = tools.map((tool) => tool.name);
      if (JSON.stringify(toolNames) !== JSON.stringify(expectedTools)) {
        throw new Error(`knowledge-base bundle listed unexpected tools: ${JSON.stringify(toolNames)}`);
      }
      const chapters = parseToolPayload(
        await requestTool(child, state, died, timeout, 3, "knowledge_list_chapters", {}),
        "knowledge_list_chapters",
      );
      if (JSON.stringify(chapters.chapters?.map((chapter) => chapter.key)) !== JSON.stringify(["smoke"])) {
        throw new Error(`knowledge-base bundle listed unexpected chapters: ${JSON.stringify(chapters.chapters)}`);
      }
      const fullEntry = parseToolPayload(
        await requestTool(child, state, died, timeout, 4, "knowledge_get_entry", { key: "smoke.synthetic-entry" }),
        "knowledge_get_entry",
      );
      if (
        fullEntry.entry?.key !== "smoke.synthetic-entry" ||
        fullEntry.entry?.chapter !== "smoke" ||
        !fullEntry.entry?.content?.includes("Synthetic standalone bundle smoke content.")
      ) {
        throw new Error("knowledge-base bundle returned the wrong synthetic entry");
      }
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
    const knowledgeRoot = await createSyntheticKnowledgeRoot(tempRoot);
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
        const knowledgeBase = bundle.name === "knowledge-base";
        await handshake(
          isolatedBundle,
          bundle.name,
          bundle.version,
          knowledgeBase ? tempRoot : dirname(isolatedBundle),
          knowledgeBase ? { [KNOWLEDGE_BASE_DIR_ENV]: knowledgeRoot } : {},
        );
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
