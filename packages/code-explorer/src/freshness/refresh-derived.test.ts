import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../index.js";
import { createNativeProjectRoot } from "../semantic/project-root.js";
import { WorkspaceFreshness } from "./workspace-freshness.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";

function adapter(refresh: () => Promise<void>, name: () => string): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "fixture",
      backend_version: "1",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" }, references: { state: "ready" }, type_definition: { state: "ready" },
        implementation: { state: "ready" }, callers: { state: "ready" }, callees: { state: "ready" },
      },
      last_transition_time: 0,
    }),
    refresh,
    request: async () => ({
      operation: "search",
      revision: { generation: 1, manifest_sha256: "fixture" },
      symbols: [{
        id: name(), name: name(), language: "rust", kind: "function",
        location: { path: "src/lib.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
      }],
    }),
  };
}

function freshness(): WorkspaceFreshness {
  let revision = 0;
  return new WorkspaceFreshness({
    reconcile: async () => ({ manifest: new Map([["src/lib.rs", String(revision++)]]) }),
  });
}

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), "code-explorer-refresh-"));
  mkdirSync(join(directory, "src"));
  writeFileSync(join(directory, "src", "lib.rs"), "fn fixture() {}\n");
  return directory;
}

async function session(server: ReturnType<typeof createServer>): Promise<string> {
  const result = await server.call("code_status", { action: "start_session" });
  if ("code" in result || typeof result.data.session_id !== "string") throw new Error("expected session");
  return result.data.session_id;
}

// covers: code-explorer/workspace-freshness :: Explicit refresh rebuilds derived discovery data :: Refresh completes
it("atomically publishes replacement derived discovery after backend refresh completes", async () => {
  let symbol = "before";
  const directory = root();
  try {
    const server = createServer({
      projectRoot: createNativeProjectRoot(directory), adapters: [adapter(async () => { symbol = "after"; }, () => symbol)], freshness: freshness(),
    });
    const id = await session(server);
    const before = await server.call("code_search", { query: "before" });
    const status = await server.call("code_status", { action: "refresh", session_id: id, request_id: "refresh-success-0001" });
    const after = await server.call("code_search", { query: "after" });
    assert.equal("code" in before, false);
    assert.equal("code" in status, false);
    assert.equal("code" in after, false);
    if ("code" in status || "code" in after) throw new Error("expected refresh result");
    assert.equal(status.state, "refreshed");
    assert.equal(status.project_generation, 2);
    assert.deepEqual((after.data.candidates as Array<{ name: string }>).map((candidate) => candidate.name), ["after"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// covers: code-explorer/workspace-freshness :: Explicit refresh rebuilds derived discovery data :: Refresh fails before completion
it("retains the complete generation and reports refresh_failed when a backend becomes unavailable", async () => {
  const directory = root();
  try {
    const server = createServer({
      projectRoot: createNativeProjectRoot(directory), adapters: [adapter(async () => { throw new Error("backend unavailable at C:/private"); }, () => "retained")], freshness: freshness(),
    });
    const id = await session(server);
    const prior = await server.call("code_search", { query: "retained" });
    const status = await server.call("code_status", { action: "refresh", session_id: id, request_id: "refresh-failure-01" });
    const later = await server.call("code_search", { query: "retained" });
    assert.equal("code" in prior, false);
    assert.equal("code" in status, false);
    assert.equal("code" in later, false);
    if ("code" in status || "code" in later) throw new Error("expected status result");
    assert.equal(status.state, "refresh_failed");
    assert.equal(status.project_generation, 1);
    assert.equal(JSON.stringify(status).includes("C:/private"), false);
    assert.deepEqual((later.data.candidates as Array<{ name: string }>).map((candidate) => candidate.name), ["retained"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
