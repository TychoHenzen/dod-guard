import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../index.js";
import { WorkspaceFreshness } from "../freshness/workspace-freshness.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";
import { createFocusView, stableSymbolId } from "./focus-view.js";

const symbol = {
  id: "backend-id",
  name: "helper",
  qualified_name: "crate::helper",
  language: "rust" as const,
  kind: "function",
  location: { path: "src\\lib.rs", range: { start: { line: 2, character: 3 }, end: { line: 2, character: 9 } } },
};

// covers: code-explorer/mcp-navigation :: Focusing a symbol creates a bounded explicit view :: Function focus succeeds
it("focuses one semantic function into a new immutable view with visible handles", async () => {
  const server = createServer({
    adapters: [
      focusAdapter({
        body: "fn helper(value: TypeName) { TypeName::new(value) }",
        visible_symbols: [
          { name: "TypeName", symbol_id: "type-id" },
          { name: "not_visible", symbol_id: "hidden-id" },
        ],
      }),
    ],
  });
  const sessionId = await startSession(server);

  const first = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0001",
    symbol_id: "backend-id",
  });
  const second = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0002",
    symbol_id: "backend-id",
  });
  assert.equal("code" in first, false);
  assert.equal("code" in second, false);
  if ("code" in first || "code" in second) throw new Error("expected focus views");
  const view = first.data as ReturnType<typeof createFocusView>;
  assert.equal(view.symbol_id, stableSymbolId(symbol));
  assert.equal(view.path, "src/lib.rs");
  assert.equal(view.kind, "function");
  assert.equal(view.content.body, "fn helper(value: TypeName) { TypeName::new(value) }");
  assert.equal(view.content.truncated, false);
  assert.deepEqual(
    view.handles.map(({ name, symbol_id }) => [name, symbol_id]),
    [["TypeName", "type-id"]],
  );
  assert.notEqual(view.view_id, (second.data as ReturnType<typeof createFocusView>).view_id);
});

// covers: code-explorer/mcp-navigation :: Focusing a symbol creates a bounded explicit view :: Symbol content exceeds the response budget
it("returns a UTF-8-safe prefix and byte accounting when a focus body exceeds its budget", () => {
  const view = createFocusView(symbol, { body: `${"a".repeat(1023)}😀suffix` }, 1024);
  assert.equal(view.content.body, "a".repeat(1023));
  assert.deepEqual(view.content, {
    body: "a".repeat(1023),
    truncated: true,
    limit_bytes: 1024,
    returned_bytes: 1023,
    total_bytes: 1033,
  });
});

// covers: code-explorer/mcp-navigation :: Focusing a symbol creates a bounded explicit view :: Symbol has no retrievable body
it("returns semantic identity without reading a whole file when the backend supplies no content", async () => {
  const server = createServer({ adapters: [focusAdapter(undefined)] });
  const sessionId = await startSession(server);
  const result = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0001",
    symbol_id: "backend-id",
  });
  assert.equal("code" in result, false);
  if ("code" in result) throw new Error("expected focus view");
  const view = result.data as ReturnType<typeof createFocusView>;
  assert.equal(view.symbol_id, stableSymbolId(symbol));
  assert.equal("body" in view.content, false);
  assert.equal("declaration" in view.content, false);
  assert.deepEqual(view.content, {
    truncated: false,
    limit_bytes: 32 * 1024,
    returned_bytes: 0,
    total_bytes: 0,
  });
});

// covers: code-explorer/workspace-freshness :: Views remain immutable after creation :: Client follows a handle from an older view
it("returns stale_view generations without dispatching semantics for an old view", async () => {
  const manifests = [new Map([["src/lib.rs", "one"]]), new Map([["src/lib.rs", "two"]])];
  const freshness = new WorkspaceFreshness({ reconcile: async () => ({ manifest: manifests.shift() ?? new Map() }) });
  let requests = 0;
  const adapter = focusAdapter({ body: "TypeName", visible_symbols: [{ name: "TypeName", symbol_id: "type-id" }] });
  const originalRequest = adapter.request;
  adapter.request = async (request) => {
    requests += 1;
    return originalRequest(request);
  };
  const server = createServer({ adapters: [adapter], freshness });
  const sessionId = await startSession(server);
  const focused = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0001",
    symbol_id: "backend-id",
  });
  if ("code" in focused) throw new Error("expected focus view");
  const view = focused.data as ReturnType<typeof createFocusView>;
  await freshness.reconcile();
  const followed = await server.call("code_follow", {
    session_id: sessionId,
    request_id: "follow-request-0001",
    view_id: view.view_id,
    handle: view.handles[0]?.handle ?? "missing",
    relation: "definition",
  });
  assert.deepEqual(followed, {
    schema_version: 1,
    code: "stale_view",
    message: "stale_view",
    retryable: false,
    details: { view_generation: 1, current_generation: 2 },
  });
  assert.equal(requests, 1);
});

// covers: code-explorer/workspace-freshness :: Views remain immutable after creation :: Client restores old history
it("restores an old immutable view with its original generation and stale label", async () => {
  const manifests = [new Map([["src/lib.rs", "one"]]), new Map([["src/lib.rs", "two"]])];
  const freshness = new WorkspaceFreshness({ reconcile: async () => ({ manifest: manifests.shift() ?? new Map() }) });
  const server = createServer({ adapters: [focusAdapter({ body: "TypeName", visible_symbols: [{ name: "TypeName", symbol_id: "type-id" }] })], freshness });
  const sessionId = await startSession(server);
  const first = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0001",
    symbol_id: "backend-id",
  });
  if ("code" in first) throw new Error("expected first focus");
  await freshness.reconcile();
  await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0002",
    symbol_id: "backend-id",
  });
  const restored = await server.call("code_history", {
    session_id: sessionId,
    request_id: "history-request-0001",
    action: "back",
  });
  if ("code" in restored) throw new Error("expected restored view");
  assert.equal(restored.project_generation, 2);
  assert.equal(restored.data.project_generation, 1);
  assert.equal(restored.data.stale, true);
});

function focusAdapter(
  content: { body: string; visible_symbols: { name: string; symbol_id: string }[] } | undefined,
): LanguageAdapter {
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
    request: async () => ({
      operation: "focus",
      revision: { generation: 7, manifest_sha256: "fixture" },
      symbol,
      ...(content ? { content } : {}),
    }),
  };
}

async function startSession(server: ReturnType<typeof createServer>): Promise<string> {
  const response = await server.call("code_status", { action: "start_session" });
  if ("code" in response || typeof response.data.session_id !== "string") throw new Error("expected session");
  return response.data.session_id;
}
