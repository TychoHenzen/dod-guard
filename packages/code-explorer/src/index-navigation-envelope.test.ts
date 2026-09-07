import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "./index.js";
import { followDefinition, focusableNavigationAdapter, startSession } from "./testing/index-test-server-support.js";

it("returns only the common versioned envelope for every successful tool", async () => {
  const server = createServer({ adapters: [focusableNavigationAdapter()] });
  const sessionId = await startSession(server);
  const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["code_search", { query: "helper" }],
    ["code_focus", { session_id: sessionId, request_id: "focus-request-00001", symbol_id: "symbol" }],
    ["code_history", { session_id: sessionId, request_id: "history-request-001", action: "recent", limit: 1 }],
    ["code_status", { action: "status" }],
  ];
  for (const [name, arguments_] of calls) {
    const result = await server.call(name, arguments_);
    assert.equal("code" in result, false);
    if ("code" in result) throw new Error(`${name} unexpectedly failed`);
    assert.deepEqual(Object.keys(result).sort(), ["data", "pending_generation", "project_generation", "project_id", "schema_version", "state"]);
    assert.equal(result.schema_version, 1);
    assert.equal(typeof result.project_id, "string");
    assert.equal(typeof result.project_generation, "number");
    assert.equal(result.pending_generation, null);
  }
  const focused = await server.call("code_focus", { session_id: sessionId, request_id: "focus-request-00002", symbol_id: "symbol" });
  if ("code" in focused) throw new Error("expected focus");
  const data = focused.data as { view_id: string; handles: Array<{ handle: string }> };
  const followed = await followDefinition({ server, sessionId, viewId: data.view_id, handle: data.handles[0]?.handle ?? "missing" });
  assert.equal("code" in followed, false);
});

it("makes an unsupported relation explicit instead of returning an empty result array", async () => {
  const server = createServer({ adapters: [focusableNavigationAdapter()] });
  const sessionId = await startSession(server);
  const focused = await server.call("code_focus", { session_id: sessionId, request_id: "focus-request-00001", symbol_id: "symbol" });
  if ("code" in focused) throw new Error("expected focus");
  const data = focused.data as { view_id: string; handles: Array<{ handle: string }> };
  for (const [index, relation] of "definition,references,callers,callees,type,implementation".split(",").entries()) {
    const result = await server.call("code_follow", {
      session_id: sessionId,
      request_id: `follow-request-${index.toString().padStart(4, "0")}`,
      view_id: data.view_id,
      handle: data.handles[0]?.handle ?? "missing",
      relation,
    });
    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected an unavailable relation result");
    assert.equal(result.state, "unavailable_relation");
    assert.deepEqual(result.data, { relation });
    assert.equal(Array.isArray((result.data as Record<string, unknown>).results), false);
  }
});
