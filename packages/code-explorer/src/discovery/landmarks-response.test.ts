import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../index.js";
import { landmarksNotReady, readyLandmarks } from "./landmarks.js";
import { createNativeProjectRoot } from "../semantic/project-root.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";

// covers: code-explorer/project-landmarks :: An empty search returns project landmarks :: Client has no search term
it("returns bounded grouped landmarks with selectable symbol identities for an empty query", async () => {
  const root = fixtureRoot();
  let searches = 0;
  try {
    const server = createServer({
      projectRoot: createNativeProjectRoot(root),
      adapters: [countingAdapter(() => (searches += 1))],
      landmarks: readyLandmarks([
        {
          group: "entry_points",
          symbols: Array.from({ length: 11 }, (_, index) => ({
            symbol_id: `entry-${index}`,
            name: `Entry${index}`,
            path: "src/main.rs",
            kind: "function",
          })),
        },
      ]),
    });
    const result = await server.call("code_search", { query: "" });

    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected landmarks");
    assert.equal(result.state, "ready");
    const groups = result.data.landmarks as Array<{ group: string; symbols: Array<{ symbol_id: string }> }>;
    assert.deepEqual(groups.map(({ group }) => group), ["entry_points"]);
    assert.equal(groups[0]?.symbols.length, 10);
    assert.equal(groups[0]?.symbols[0]?.symbol_id, "entry-0");
    assert.equal(searches, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// covers: code-explorer/project-landmarks :: An empty search returns project landmarks :: Landmark index is not ready
it("reports landmark initialization without substituting ordinary search candidates", async () => {
  const root = fixtureRoot();
  let searches = 0;
  try {
    const server = createServer({
      projectRoot: createNativeProjectRoot(root),
      adapters: [countingAdapter(() => (searches += 1))],
      landmarks: landmarksNotReady(),
    });
    const result = await server.call("code_search", { query: "" });

    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected landmark readiness response");
    assert.equal(result.state, "landmarks_not_ready");
    assert.deepEqual(result.data, { landmarks: [], landmark_state: "landmarks_not_ready" });
    assert.equal(searches, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-landmark-response-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.rs"), "fn arbitrary_fallback() {}\n");
  return root;
}

function countingAdapter(onSearch: () => void): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "fixture",
      backend_version: "1.0.0",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" }, references: { state: "ready" }, type_definition: { state: "ready" },
        implementation: { state: "ready" }, callers: { state: "ready" }, callees: { state: "ready" },
      },
      last_transition_time: 0,
    }),
    request: async () => {
      onSearch();
      return { operation: "search", revision: { generation: 1, manifest_sha256: "fixture" }, symbols: [] };
    },
  };
}
