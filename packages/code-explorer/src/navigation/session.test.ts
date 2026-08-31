import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../index.js";
import { createFocusView } from "./focus-view.js";
import { canonicalFingerprint, SessionManager } from "./session.js";

const symbol = {
  id: "symbol",
  name: "source",
  language: "rust" as const,
  kind: "function",
  location: { path: "src/lib.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } },
};

function view() {
  return createFocusView(symbol, { body: "Type", visible_symbols: [{ name: "Type", symbol_id: "target" }] });
}

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client follows a valid visible handle
it("resolves a visible handle only from its immutable issuing view", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.tryStart("connection", 0);
  if (!sessionId) throw new Error("expected session");
  const first = view();
  assert.equal(sessions.addView("connection", sessionId, first), "ok");
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, first.view_id, first.handles[0].handle), {
    state: "ok",
    symbolId: "target",
  });
  const result = view();
  assert.equal(sessions.addView("connection", sessionId, result), "ok");
  assert.notEqual(result.view_id, first.view_id);
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Handle belongs to another view
it("does not resolve handles through another or missing view", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const first = view();
  const other = view();
  sessions.addView("connection", sessionId, first);
  sessions.addView("connection", sessionId, other);
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, other.view_id, first.handles[0].handle), {
    state: "invalid_view_handle",
  });
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, "expired", first.handles[0].handle), {
    state: "invalid_view_handle",
  });
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client connection closes
it("removes a connection's sessions, views, and handles when it closes", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const first = view();
  sessions.addView("connection", sessionId, first);
  sessions.closeConnection("connection");
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, first.view_id, first.handles[0].handle), {
    state: "invalid_view_handle",
  });
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Concurrent requests target one session
it("serializes concurrent work for one session in accepted order", async () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const observed: number[] = [];
  const first = sessions.execute("connection", sessionId, "request-identifier-1", "code_focus", {}, async () => {
    observed.push(1);
    return observed.length;
  });
  const second = sessions.execute("connection", sessionId, "request-identifier-2", "code_focus", {}, async () => {
    observed.push(2);
    return observed.length;
  });
  assert.equal(first.state, "ok");
  assert.equal(second.state, "ok");
  if (first.state !== "ok" || second.state !== "ok") throw new Error("expected queued work");
  assert.deepEqual(await Promise.all([first.response, second.response]), [1, 2]);
  assert.deepEqual(observed, [1, 2]);
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client reconnects after losing its session
it("rejects a closed connection's identifier from a new connection", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("old");
  sessions.closeConnection("old");
  assert.equal(
    sessions.execute("new", sessionId, "request-identifier", "code_focus", {}, async () => 1).state,
    "invalid_session",
  );
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client retries the same navigation request
it("replays retained completed responses without another operation", async () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  let operations = 0;
  const one = sessions.execute(
    "connection",
    sessionId,
    "request-identifier",
    "code_focus",
    { symbol_id: "one" },
    async () => ++operations,
  );
  const two = sessions.execute(
    "connection",
    sessionId,
    "request-identifier",
    "code_focus",
    { symbol_id: "one" },
    async () => ++operations,
  );
  if (one.state !== "ok" || two.state !== "ok") throw new Error("expected replay");
  assert.deepEqual(await Promise.all([one.response, two.response]), [1, 1]);
  assert.equal(operations, 1);
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Duplicate request is still in flight
it("joins an in-flight duplicate without another queue slot", async () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  let release: (() => void) | undefined;
  let operations = 0;
  const wait = new Promise<void>((resolve) => (release = resolve));
  const one = sessions.execute(
    "connection",
    sessionId,
    "request-identifier",
    "code_focus",
    { symbol_id: "one" },
    async () => {
      operations += 1;
      await wait;
      return 7;
    },
  );
  const two = sessions.execute(
    "connection",
    sessionId,
    "request-identifier",
    "code_focus",
    { symbol_id: "one" },
    async () => 8,
  );
  if (one.state !== "ok" || two.state !== "ok") throw new Error("expected replay");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(operations, 1);
  release?.();
  assert.deepEqual(await Promise.all([one.response, two.response]), [7, 7]);
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Request identifier is reused for different content
it("rejects a retained identifier whose canonical request differs", async () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const one = sessions.execute(
    "connection",
    sessionId,
    "request-identifier",
    "code_focus",
    { nested: { b: 2, a: 1 } },
    async () => 1,
  );
  if (one.state !== "ok") throw new Error("expected work");
  await one.response;
  assert.equal(
    sessions.execute(
      "connection",
      sessionId,
      "request-identifier",
      "code_focus",
      { nested: { a: 1, b: 3 } },
      async () => 2,
    ).state,
    "request_id_conflict",
  );
  assert.equal(
    canonicalFingerprint("code_focus", { request_id: "first", nested: { b: 2, a: 1 } }),
    canonicalFingerprint("code_focus", { request_id: "second", nested: { a: 1, b: 2 } }),
  );
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Request identifier retention expires
it("accepts an identifier as new work after its retention expires", async () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const one = sessions.execute("connection", sessionId, "request-identifier", "code_focus", {}, async () => 1, 0);
  if (one.state !== "ok") throw new Error("expected work");
  await one.response;
  const two = sessions.execute("connection", sessionId, "request-identifier", "code_focus", {}, async () => 2, 300_001);
  if (two.state !== "ok") throw new Error("expected renewed work");
  assert.equal(await two.response, 2);
});

// covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: Client navigates back
it("restores the prior focused view with its original handles", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const first = view();
  const second = view();
  sessions.addView("connection", sessionId, first);
  sessions.addView("connection", sessionId, second);
  const restored = sessions.restore("connection", sessionId, "back");
  assert.equal(restored, first);
  assert.equal(restored?.handles[0]?.handle, first.handles[0]?.handle);
});

// covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: Client navigates forward
it("restores the next recorded view after moving back", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const first = view();
  const second = view();
  sessions.addView("connection", sessionId, first);
  sessions.addView("connection", sessionId, second);
  sessions.restore("connection", sessionId, "back");
  assert.equal(sessions.restore("connection", sessionId, "forward"), second);
});

// covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: New navigation follows Back
it("replaces the abandoned forward branch when a new view follows back", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const first = view();
  const abandoned = view();
  const replacement = view();
  sessions.addView("connection", sessionId, first);
  sessions.addView("connection", sessionId, abandoned);
  sessions.restore("connection", sessionId, "back");
  sessions.addView("connection", sessionId, replacement);
  assert.deepEqual(sessions.history("connection", sessionId), [first.view_id, replacement.view_id]);
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, abandoned.view_id, abandoned.handles[0].handle), {
    state: "stale_view",
  });
});

// covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: Client asks for recent locations
it("lists only bounded recent views from its own session", () => {
  const sessions = new SessionManager();
  const one = sessions.start("one");
  const two = sessions.start("two");
  const first = view();
  const second = view();
  const other = view();
  sessions.addView("one", one, first);
  sessions.addView("one", one, second);
  sessions.addView("two", two, other);
  assert.deepEqual(
    sessions.recent("one", one, 1)?.map((candidate) => candidate.view_id),
    [second.view_id],
  );
});

// covers: code-explorer/mcp-navigation :: Navigation history is explicit, bounded, and isolated :: History exceeds its capacity
it("evicts the oldest non-current retained view and marks its handles stale", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const views = Array.from({ length: 65 }, () => view());
  for (const candidate of views) sessions.addView("connection", sessionId, candidate);
  assert.equal(sessions.history("connection", sessionId)?.length, 64);
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, views[0].view_id, views[0].handles[0].handle), {
    state: "stale_view",
  });
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, views[64].view_id, views[64].handles[0].handle), {
    state: "ok",
    symbolId: "target",
  });
});

// covers: code-explorer/mcp-navigation :: Aggregate retained state is bounded :: Live session capacity is reached
it("does not allocate a ninth live session", async () => {
  const server = createServer();
  for (let index = 0; index < 8; index += 1) {
    const result = await server.call("code_status", { action: "start_session" });
    assert.equal("code" in result, false);
  }
  const result = await server.call("code_status", { action: "start_session" });
  assert.deepEqual(result, {
    schema_version: 1,
    code: "project_capacity",
    message: "project_capacity",
    retryable: true,
  });
});

// covers: code-explorer/mcp-navigation :: Aggregate retained state is bounded :: Retained view bytes reach the project limit
it("evicts eligible views before rejecting a retained-body allocation that cannot fit", () => {
  const evicting = new SessionManager({ maxRetainedBodyBytes: 8 });
  const evictingSession = evicting.start("evicting");
  const first = view();
  const eligible = view();
  const replacement = view();
  evicting.addView("evicting", evictingSession, first);
  evicting.addView("evicting", evictingSession, eligible);
  evicting.restore("evicting", evictingSession, "back");
  assert.equal(evicting.addView("evicting", evictingSession, replacement), "ok");
  assert.deepEqual(evicting.resolveHandle("evicting", evictingSession, eligible.view_id, eligible.handles[0].handle), {
    state: "stale_view",
  });

  const sessions = new SessionManager({ maxRetainedBodyBytes: 4 });
  const sessionId = sessions.start("connection");
  const current = view();
  const next = view();
  assert.equal(sessions.addView("connection", sessionId, current), "ok");
  assert.equal(sessions.addView("connection", sessionId, next), "project_capacity");
  assert.deepEqual(sessions.resolveHandle("connection", sessionId, current.view_id, current.handles[0].handle), {
    state: "ok",
    symbolId: "target",
  });
});

// covers: code-explorer/mcp-navigation :: Aggregate retained state is bounded :: Idle session expires
it("releases an idle session before later request use", async () => {
  let now = 0;
  const server = createServer({ now: () => now });
  const started = await server.call("code_status", { action: "start_session" });
  if ("code" in started || typeof started.data.session_id !== "string") throw new Error("expected session");
  now = 30 * 60 * 1000;
  const result = await server.call("code_history", {
    session_id: started.data.session_id,
    request_id: "request-after-idle",
    action: "recent",
  });
  assert.deepEqual(result, { schema_version: 1, code: "invalid_session", message: "invalid_session", retryable: true });
});
