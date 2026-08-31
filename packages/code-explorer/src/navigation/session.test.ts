import assert from "node:assert/strict";
import { it } from "node:test";
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
  const sessionId = sessions.start("connection");
  const first = view();
  assert.equal(sessions.addView("connection", sessionId, first), true);
  assert.equal(sessions.resolveHandle("connection", sessionId, first.view_id, first.handles[0].handle), "target");
  const result = view();
  assert.equal(sessions.addView("connection", sessionId, result), true);
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
  assert.equal(sessions.resolveHandle("connection", sessionId, other.view_id, first.handles[0].handle), undefined);
  assert.equal(sessions.resolveHandle("connection", sessionId, "expired", first.handles[0].handle), undefined);
});

// covers: code-explorer/mcp-navigation :: Sessions, views, and handles have explicit ownership :: Client connection closes
it("removes a connection's sessions, views, and handles when it closes", () => {
  const sessions = new SessionManager();
  const sessionId = sessions.start("connection");
  const first = view();
  sessions.addView("connection", sessionId, first);
  sessions.closeConnection("connection");
  assert.equal(sessions.resolveHandle("connection", sessionId, first.view_id, first.handles[0].handle), undefined);
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
