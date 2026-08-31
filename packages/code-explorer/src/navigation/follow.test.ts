import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../index.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";

const source = symbol("source", "Source", "function", "src/source.rs", 0);
const type = symbol("type", "Type", "struct", "src/types.rs", 4);
const reference = symbol("reference", "reference", "function", "src/references.rs", 8);
const caller = symbol("caller", "caller", "function", "src/caller.rs", 12);

// covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Visible type follows to its definition
it("focuses a project-local definition and cites its source location", async () => {
  const server = createServer({ adapters: [relationAdapter("definition")] });
  const { sessionId, viewId, handle } = await visibleHandle(server, "type");
  const response = await server.call("code_follow", {
    session_id: sessionId,
    request_id: "definition-request-001",
    view_id: viewId,
    handle,
    relation: "definition",
  });
  assert.equal("code" in response, false);
  if ("code" in response) throw new Error("expected definition");
  assert.equal(response.state, "ready");
  const focus = response.data.focus as {
    relation: string;
    relation_source: string;
    backend_name: string;
    path: string;
    kind: string;
    range: unknown;
    external: boolean;
    handle: string;
    view_id: string;
  };
  assert.deepEqual(response.data.source_location, type.location.range);
  assert.equal(focus.relation, "definition");
  assert.equal(focus.relation_source, "semantic");
  assert.equal(focus.backend_name, "fixture-lsp");
  assert.equal(focus.path, "src/types.rs");
  assert.equal(focus.kind, "struct");
  assert.deepEqual(focus.range, type.location.range);
  assert.equal(focus.external, false);
  assert.equal(typeof focus.view_id, "string");
  assert.equal(typeof focus.handle, "string");
});

// covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Client requests references
it("returns bounded deterministic source-located references with next-focus handles", async () => {
  const server = createServer({ adapters: [relationAdapter("references")] });
  const { sessionId, viewId, handle } = await visibleHandle(server, "reference");
  const response = await server.call("code_follow", {
    session_id: sessionId,
    request_id: "references-request-01",
    view_id: viewId,
    handle,
    relation: "references",
    limit: 1,
  });
  assert.equal("code" in response, false);
  if ("code" in response) throw new Error("expected references");
  const candidates = response.data.candidates as Array<{
    path: string;
    handle: string;
    view_id: string;
    external: boolean;
  }>;
  assert.deepEqual(
    candidates.map(({ path }) => path),
    ["src/references.rs"],
  );
  assert.ok(
    candidates.every(
      ({ handle, view_id, external }) =>
        typeof handle === "string" && typeof view_id === "string" && external === false,
    ),
  );
});

// covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Client requests callers or callees
it("returns only backend-proven callers and callees with call sites", async () => {
  for (const relation of ["callers", "callees"] as const) {
    const server = createServer({ adapters: [relationAdapter(relation)] });
    const { sessionId, viewId, handle } = await visibleHandle(server, "callable");
    const response = await server.call("code_follow", {
      session_id: sessionId,
      request_id: `${relation}-request-00001`,
      view_id: viewId,
      handle,
      relation,
    });
    assert.equal("code" in response, false);
    if ("code" in response) throw new Error("expected call result");
    const candidate = (response.data.candidates as Array<{ relation_source: string; call_site: unknown }>)[0];
    assert.equal(candidate.relation_source, "semantic");
    assert.deepEqual(candidate.call_site, { path: "src/caller.rs", range: caller.location.range });
  }
});

// covers: code-explorer/mcp-navigation :: A visible handle can follow semantic relations :: Requested semantic relation is unavailable
it("reports unavailable relations without relabeling references as calls", async () => {
  const server = createServer({ adapters: [relationAdapter("references", { callers: { state: "unavailable" } })] });
  const { sessionId, viewId, handle } = await visibleHandle(server, "callable");
  const response = await server.call("code_follow", {
    session_id: sessionId,
    request_id: "unavailable-request-01",
    view_id: viewId,
    handle,
    relation: "callers",
  });
  assert.equal("code" in response, false);
  if ("code" in response) throw new Error("expected unavailable relation");
  assert.equal(response.state, "unavailable_relation");
  assert.deepEqual(response.data, { relation: "callers" });
});

async function visibleHandle(server: ReturnType<typeof createServer>, target: string) {
  const started = await server.call("code_status", { action: "start_session" });
  if ("code" in started || typeof started.data.session_id !== "string") throw new Error("expected session");
  const focused = await server.call("code_focus", {
    session_id: started.data.session_id,
    request_id: "focus-request-visible-1",
    symbol_id: "source",
  });
  if ("code" in focused) throw new Error("expected source focus");
  const view = focused.data as { view_id: string; handles: Array<{ name: string; handle: string }> };
  const handle = view.handles.find((candidate) => candidate.name === target)?.handle;
  if (!handle) throw new Error("expected visible handle");
  return { sessionId: started.data.session_id, viewId: view.view_id, handle };
}

function relationAdapter(
  relation: "definition" | "references" | "callers" | "callees",
  overrides: Record<string, unknown> = {},
): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "fixture-lsp",
      backend_version: "1.0.0",
      discovery_source: "injected",
      state: "ready",
      capabilities: {
        definition: { state: "ready" },
        references: { state: "ready" },
        type_definition: { state: "ready" },
        implementation: { state: "ready" },
        callers: { state: "ready" },
        callees: { state: "ready" },
        ...overrides,
      },
      last_transition_time: 0,
    }),
    request: async (request) => {
      if (request.operation === "focus")
        return {
          operation: "focus",
          revision: revision(),
          symbol: source,
          content: {
            body: "type reference callable",
            visible_symbols: [
              { name: "type", symbol_id: "type" },
              { name: "reference", symbol_id: "reference" },
              { name: "callable", symbol_id: "callable" },
            ],
          },
        };
      if (request.operation === relation)
        return {
          operation: relation,
          revision: revision(),
          relations: [
            {
              relation,
              symbol: relation === "definition" ? type : relation === "references" ? reference : caller,
              location:
                relation === "definition"
                  ? type.location
                  : relation === "references"
                    ? reference.location
                    : caller.location,
              ...(relation === "callers" || relation === "callees" ? { call_site: caller.location } : {}),
            },
          ],
        };
      throw new Error("unexpected relation");
    },
  };
}

function revision() {
  return { generation: 1, manifest_sha256: "fixture" };
}

function symbol(id: string, name: string, kind: string, path: string, line: number) {
  return {
    id,
    name,
    language: "rust" as const,
    kind,
    location: { path, range: { start: { line, character: 0 }, end: { line, character: 4 } } },
  };
}
