import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../index.js";
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

  const first = await server.call("code_focus", {
    session_id: "session",
    request_id: "request",
    symbol_id: "backend-id",
  });
  const second = await server.call("code_focus", {
    session_id: "session",
    request_id: "request-2",
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
  const result = await server.call("code_focus", {
    session_id: "session",
    request_id: "request",
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
