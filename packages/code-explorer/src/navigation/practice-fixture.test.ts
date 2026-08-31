import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createServer } from "../index.js";
import { createNativeProjectRoot } from "../semantic/project-root.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";

it("runs fuzzy search through focus, follow, history, and stale-handle rejection", async () => {
  const root = fixtureRoot();
  try {
    const server = createServer({ projectRoot: createNativeProjectRoot(root), adapters: [practiceAdapter()] });
    const search = await server.call("code_search", { query: "helpertargt" });
    assert.equal("code" in search, false);
    if ("code" in search) throw new Error("expected fuzzy search result");
    assert.deepEqual((search.data.candidates as Array<{ identity: string }>).map(({ identity }) => identity), ["source"]);

    const started = await server.call("code_status", { action: "start_session" });
    if ("code" in started || typeof started.data.session_id !== "string") throw new Error("expected session");
    const sessionId = started.data.session_id;
    const focused = await server.call("code_focus", {
      session_id: sessionId,
      request_id: "practice-focus-source-0001",
      symbol_id: "source",
    });
    if ("code" in focused) throw new Error("expected source focus");
    const source = focused.data as { view_id: string; handles: Array<{ name: string; handle: string }> };
    const handle = source.handles.find(({ name }) => name === "Destination")?.handle;
    if (!handle) throw new Error("expected visible destination handle");

    const followed = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "practice-follow-visible-0001",
      view_id: source.view_id,
      handle,
      relation: "definition",
    });
    assert.equal("code" in followed, false);
    if ("code" in followed) throw new Error("expected definition follow");
    assert.equal((followed.data.focus as { symbol_id: string }).symbol_id.length > 0, true);

    const back = await server.call("code_history", {
      session_id: sessionId,
      request_id: "practice-history-back-0001",
      action: "back",
    });
    const forward = await server.call("code_history", {
      session_id: sessionId,
      request_id: "practice-history-forward-01",
      action: "forward",
    });
    assert.equal("code" in back, false);
    assert.equal("code" in forward, false);
    if ("code" in back || "code" in forward) throw new Error("expected history restore");
    assert.equal(back.data.view_id, source.view_id);
    assert.notEqual(forward.data.view_id, source.view_id);

    for (let index = 0; index < 64; index += 1) {
      const result = await server.call("code_focus", {
        session_id: sessionId,
        request_id: `practice-eviction-${index.toString().padStart(8, "0")}`,
        symbol_id: "source",
      });
      if ("code" in result) throw new Error("expected fixture focus while evicting views");
    }
    const stale = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "practice-stale-handle-0001",
      view_id: source.view_id,
      handle,
      relation: "definition",
    });
    assert.deepEqual(stale, {
      schema_version: 1,
      code: "stale_view",
      message: "stale_view",
      retryable: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-navigation-practice-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "navigation.rs"), "fn helper_target() { Destination; }\nstruct Destination;\n");
  return root;
}

function practiceAdapter(): LanguageAdapter {
  const source = symbol("source", "HelperTarget", "function", 0);
  const destination = symbol("destination", "Destination", "struct", 1);
  return {
    status: () => ({
      language: "rust",
      backend_name: "practice-fixture",
      backend_version: "1.0.0",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" }, references: { state: "unavailable" }, type_definition: { state: "unavailable" },
        implementation: { state: "unavailable" }, callers: { state: "unavailable" }, callees: { state: "unavailable" },
      },
      last_transition_time: 0,
    }),
    request: async (request) => {
      if (request.operation === "search") return { operation: "search", revision: revision(), symbols: [source] };
      if (request.operation === "focus")
        return {
          operation: "focus",
          revision: revision(),
          symbol: source,
          content: { body: "fn helper_target() { Destination; }", visible_symbols: [{ name: "Destination", symbol_id: "destination" }] },
        };
      if (request.operation === "definition")
        return {
          operation: "definition",
          revision: revision(),
          relations: [{ relation: "definition", symbol: destination, location: destination.location }],
        };
      throw new Error("backend_unavailable");
    },
  };
}

function symbol(id: string, name: string, kind: string, line: number) {
  return {
    id,
    name,
    language: "rust" as const,
    kind,
    location: { path: "src/navigation.rs", range: { start: { line, character: 0 }, end: { line, character: 6 } } },
  };
}

function revision() {
  return { generation: 1, manifest_sha256: "practice-fixture" };
}
