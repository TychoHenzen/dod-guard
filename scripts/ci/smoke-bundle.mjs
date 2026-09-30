#!/usr/bin/env node
// Usage: node scripts/ci/smoke-bundle.mjs <package-name>
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2025-06-18";
const KNOWLEDGE_BASE_DIR_ENV = "DOD_GUARD_KNOWLEDGE_BASE_DIR";

function send(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function createSyntheticKnowledgeRoot() {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-smoke-"));
  const entries = join(root, "entries", "smoke", "nested");
  await mkdir(entries, { recursive: true });
  const content = [
    "---",
    "key: smoke.synthetic-entry",
    "title: Synthetic Smoke Entry",
    "chapter: smoke",
    "section: smoke.basics",
    "summary: A generic entry used by the bundle smoke.",
    "sources:",
    "  - label: smoke fixture",
    "    url: https://example.invalid/smoke",
    "---",
    "",
    "Synthetic bundle smoke content.",
  ].join("\n");
  await writeFile(join(entries, "entry.md"), content, "utf8");
  return root;
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

async function handshake(bundle, pkgName, expectedVersion, cwd = ROOT, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  if (!Object.prototype.hasOwnProperty.call(envOverrides, KNOWLEDGE_BASE_DIR_ENV)) {
    delete env[KNOWLEDGE_BASE_DIR_ENV];
  }
  const child = spawn(process.execPath, [bundle], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
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
    let chapters = [];
    let entryKey;
    if (pkgName === "knowledge-base") {
      const chapterPayload = parseToolPayload(
        await requestTool(child, state, died, timeout, 3, "knowledge_list_chapters", {}),
        "knowledge_list_chapters",
      );
      chapters = Array.isArray(chapterPayload.chapters) ? chapterPayload.chapters.map((chapter) => chapter.key) : [];
      if (JSON.stringify(chapters) !== JSON.stringify(["smoke"])) {
        throw new Error(`knowledge-base bundle listed unexpected chapters: ${JSON.stringify(chapters)}`);
      }

      entryKey = "smoke.synthetic-entry";
      const fullEntryPayload = parseToolPayload(
        await requestTool(child, state, died, timeout, 4, "knowledge_get_entry", { key: entryKey }),
        "knowledge_get_entry",
      );
      if (
        fullEntryPayload.entry?.key !== entryKey ||
        fullEntryPayload.entry?.chapter !== "smoke" ||
        !fullEntryPayload.entry?.content?.includes("Synthetic bundle smoke content.")
      ) {
        throw new Error("knowledge-base bundle returned the wrong synthetic entry");
      }
    }
    if (state.junk.length > 0) {
      throw new Error(`non-JSON output on stdout corrupts the MCP stream: ${state.junk[0]}`);
    }
    return {
      serverName,
      version: init.result?.serverInfo?.version,
      tools: tools.map((t) => t.name),
      chapters,
      entryKey,
    };
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
  const knowledgeRoot = pkgName === "knowledge-base" ? await createSyntheticKnowledgeRoot() : undefined;
  const envOverrides = knowledgeRoot ? { [KNOWLEDGE_BASE_DIR_ENV]: knowledgeRoot } : {};
  try {
    let directResult;
    try {
      directResult = await handshake(
        bundle,
        pkgName,
        expectedVersion,
        pkgName === "knowledge-base" ? tmpdir() : ROOT,
        envOverrides,
      );
      process.stdout.write(
        `smoke OK — ${directResult.serverName} v${directResult.version} answered initialize and listed ${directResult.tools.length} tools\n`,
      );
      process.stdout.write(`  tools: ${directResult.tools.join(", ")}\n`);
    } catch (err) {
      process.stdout.write(`smoke FAILED for ${pkgName}\n  ${err.message}\n`);
      return 1;
    }

    const symlink = join(ROOT, "node_modules", pkgName, "dist", "bundle.js");
    if (existsSync(symlink)) {
      try {
        await handshake(
          symlink,
          pkgName,
          expectedVersion,
          pkgName === "knowledge-base" ? tmpdir() : ROOT,
          envOverrides,
        );
        process.stdout.write("  symlink path OK\n");
      } catch (err) {
        process.stdout.write(`smoke FAILED for ${pkgName} via symlink path\n  ${err.message}\n`);
        return 1;
      }
    }

    const codexManifest = JSON.parse(
      readFileSync(join(ROOT, "packages", pkgName, ".codex-plugin", "plugin.json"), "utf8"),
    );
    const configured = codexManifest.mcpServers?.[pkgName];
    if (
      configured?.command !== "node" ||
      JSON.stringify(configured.args) !== JSON.stringify(["dist/bundle.js"]) ||
      configured.cwd !== "."
    ) {
      process.stdout.write(
        `smoke FAILED for ${pkgName} Codex manifest\n  Codex manifest must launch dist/bundle.js from the plugin root\n`,
      );
      return 1;
    }
    process.stdout.write("  Codex manifest OK: relative bundle path resolves from the plugin root\n");
    try {
      await handshake(configured.args[0], pkgName, expectedVersion, join(ROOT, "packages", pkgName), envOverrides);
      process.stdout.write("  Codex manifest launch OK: initialize completed through the relative path\n");
    } catch (err) {
      process.stdout.write(`smoke FAILED for ${pkgName} Codex manifest launch\n  ${err.message}\n`);
      return 1;
    }

    if (pkgName === "code-explorer") {
      const expectedTools = ["code_search", "code_focus", "code_follow", "code_history", "code_status"];
      if (JSON.stringify(directResult.tools) !== JSON.stringify(expectedTools)) {
        process.stdout.write(
          `smoke FAILED for code-explorer Codex manifest\n  fresh task listed ${JSON.stringify(directResult.tools)}\n`,
        );
        return 1;
      }
      process.stdout.write("  code-explorer tool contract OK: five MCP tools listed\n");
    }

    if (pkgName === "knowledge-base") {
      const expectedTools = [
        "knowledge_list_chapters",
        "knowledge_list_sections",
        "knowledge_list_entries",
        "knowledge_search",
        "knowledge_get_entry",
      ];
      if (JSON.stringify(directResult.tools) !== JSON.stringify(expectedTools)) {
        process.stdout.write(
          `smoke FAILED for knowledge-base tool contract\n  fresh task listed ${JSON.stringify(directResult.tools)}\n`,
        );
        return 1;
      }
      process.stdout.write("  knowledge-base tool contract OK: five read-only MCP tools listed\n");
      process.stdout.write(`  synthetic chapter and entry: ${directResult.chapters[0]} / ${directResult.entryKey}\n`);
    }

    return 0;
  } finally {
    if (knowledgeRoot) await rm(knowledgeRoot, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
