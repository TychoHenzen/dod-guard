import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../index.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";
import { createNativeProjectRoot } from "../semantic/project-root.js";

// covers: code-explorer/symbol-discovery :: Empty search is reserved for landmarks :: Empty query has no qualifying landmarks
it("returns a ready but empty landmark set without running ordinary search", async () => {
  const root = fixtureRoot();
  let searches = 0;
  try {
    const server = createServer({
      projectRoot: createNativeProjectRoot(root),
      adapters: [countingAdapter(() => (searches += 1))],
      landmarks: { state: "ready", landmarks: [] },
    });
    const result = await server.call("code_search", { query: "" });
    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected landmark result");
    assert.equal(result.state, "ready");
    assert.deepEqual(result.data, { landmarks: [], landmark_state: "ready" });
    assert.equal(searches, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// covers: code-explorer/symbol-discovery :: Empty search is reserved for landmarks :: Whitespace-only query is submitted
it("routes whitespace-only queries to the same not-ready landmark path", async () => {
  const root = fixtureRoot();
  let searches = 0;
  try {
    const server = createServer({
      projectRoot: createNativeProjectRoot(root),
      adapters: [countingAdapter(() => (searches += 1))],
    });
    const result = await server.call("code_search", { query: " \u00a0" });
    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected landmark result");
    assert.equal(result.state, "landmarks_not_ready");
    assert.deepEqual(result.data, { landmarks: [], landmark_state: "landmarks_not_ready" });
    assert.equal(searches, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-landmarks-route-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "Helper.ts"), "export const helper = 1;\n");
  return root;
}

function countingAdapter(onSearch: () => void): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "test",
      backend_version: "test",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" },
        references: { state: "ready" },
        type_definition: { state: "ready" },
        implementation: { state: "ready" },
        callers: { state: "ready" },
        callees: { state: "ready" },
      },
      last_transition_time: 0,
    }),
    request: async () => {
      onSearch();
      return { operation: "search", revision: { generation: 1, manifest_sha256: "test" }, symbols: [] };
    },
  };
}
