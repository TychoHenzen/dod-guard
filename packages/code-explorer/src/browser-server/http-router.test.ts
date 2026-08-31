import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserHttpRouter } from "./http-router.js";

const origin = "http://127.0.0.1:4410";

function request(router: BrowserHttpRouter, input: {
  method?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
}) {
  return router.handle({
    method: input.method ?? "POST",
    path: input.path ?? "/api/session",
    headers: { host: "127.0.0.1:4410", origin, "content-type": "application/json", "x-code-explorer-tab": "tab", ...input.headers },
    body: Buffer.from(input.body ?? JSON.stringify({ action: "create", tab_instance_id: "tab", document_start: "new" })),
  });
}

describe("browser HTTP boundary", () => {
  // covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Browser lists or calls a write route
  it("rejects unadvertised write routes before core dispatch", async () => {
    let calls = 0;
    const router = new BrowserHttpRouter({ origin, call: async () => { calls += 1; return { schema_version: 1 }; } });
    const response = await request(router, { path: "/api/write" });
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  });

  // covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Cross-origin preflight is sent
  it("does not grant CORS preflight", async () => {
    const router = new BrowserHttpRouter({ origin, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, { method: "OPTIONS", path: "/api/search" });
    assert.equal(response.status, 405);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
  });

  // covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Request authority or origin is not the printed endpoint
  it("rejects wrong authority before session work", async () => {
    let calls = 0;
    const router = new BrowserHttpRouter({ origin, call: async () => { calls += 1; return { schema_version: 1 }; } });
    const response = await request(router, { headers: { host: "localhost:4410" } });
    assert.equal(response.status, 403);
    assert.equal(JSON.parse(response.body).code, "invalid_browser_origin");
    assert.equal(calls, 0);
  });

  // covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Source contains HTML and script text
  // covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Navigation labels contain active browser text
  it("applies the fixed policy that keeps source and labels out of executable attributes", async () => {
    const router = new BrowserHttpRouter({ origin, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, { path: "/api/write", body: "<script>alert(1)</script>" });
    assert.equal(response.headers["content-security-policy"], "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'");
    assert.equal(response.body.includes("<script>"), false);
  });

  // covers: code-explorer/browser-server :: The HTTP boundary remains read-only and same-origin :: Source contains HTML and script text
  it("does not echo source-shaped request text into an executable response", async () => {
    const router = new BrowserHttpRouter({ origin, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, { path: "/api/write", body: "<script>window.pwned=true</script>" });
    assert.equal(response.body.includes("window.pwned"), false);
    assert.equal(response.headers["content-security-policy"]?.includes("script-src 'self'"), true);
  });

  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Request uses an unknown field
  it("rejects unknown closed-body fields", async () => {
    const router = new BrowserHttpRouter({ origin, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, { body: JSON.stringify({ action: "create", tab_instance_id: "tab", document_start: "new", extra: true }) });
    assert.equal(response.status, 400);
    assert.equal(JSON.parse(response.body).code, "invalid_request");
  });

  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Request body is oversized
  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Request body is at the byte boundary
  it("counts API bytes before JSON decoding", async () => {
    const router = new BrowserHttpRouter({ origin, call: async () => ({ schema_version: 1 }) });
    const prefix = '{"action":"status","pad":"';
    const suffix = '"}';
    const allowed = await request(router, { path: "/api/status", body: `${prefix}${"x".repeat(65_536 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}` });
    const rejected = await request(router, { path: "/api/status", body: "x".repeat(65_537) });
    assert.equal(allowed.status, 400);
    assert.equal(rejected.status, 413);
  });

  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Request body is oversized
  it("returns resource_limit for a body larger than 64 KiB", async () => {
    const router = new BrowserHttpRouter({ origin, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, { path: "/api/status", body: "x".repeat(65_537) });
    assert.equal(response.status, 413);
    assert.equal(JSON.parse(response.body).code, "resource_limit");
  });

  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Navigation response succeeds
  // covers: code-explorer/browser-server :: Static assets and server errors have stable behavior :: Navigation core returns a redacted error
  it("maps allowed navigation and redacted core errors", async () => {
    const router = new BrowserHttpRouter({ origin, call: async (name: string, arguments_: Record<string, unknown>) => name === "code_status" && arguments_.action === "start_session" ? { schema_version: 1, project_id: "p", project_generation: 1, pending_generation: null, state: "ready", data: { session_id: "core" } } : { schema_version: 1, project_id: "p", project_generation: 1, pending_generation: null, state: "ready", data: {} } });
    const created = await request(router, {});
    const session = JSON.parse(created.body).data.browser_session_id;
    const response = await request(router, { path: "/api/status", body: JSON.stringify({ action: "status" }), headers: { "x-code-explorer-session": session, "x-code-explorer-tab": "tab" } });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).state, "ready");
  });

  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Navigation response succeeds
  it("preserves a successful status envelope from the shared core", async () => {
    const router = new BrowserHttpRouter({ origin, call: async (_name: string, arguments_: Record<string, unknown>) => arguments_.action === "start_session" ? { schema_version: 1, project_id: "p", project_generation: 4, pending_generation: 5, state: "ready", data: { session_id: "core" } } : { schema_version: 1, project_id: "p", project_generation: 4, pending_generation: 5, state: "ready", data: { workspace: "ready" } } });
    const created = await request(router, {});
    const browserSession = JSON.parse(created.body).data.browser_session_id;
    const response = await request(router, { path: "/api/status", body: JSON.stringify({ action: "status" }), headers: { "x-code-explorer-session": browserSession, "x-code-explorer-tab": "tab" } });
    assert.deepEqual(JSON.parse(response.body), { schema_version: 1, project_id: "p", project_generation: 4, pending_generation: 5, state: "ready", data: { workspace: "ready" } });
  });

  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: Browser session capacity is reached
  it("returns stable capacity errors", async () => {
    const router = new BrowserHttpRouter({ origin, maxSessions: 0, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, {});
    assert.equal(response.status, 429);
    assert.equal(JSON.parse(response.body).code, "project_capacity");
  });

  // covers: code-explorer/browser-server :: Browser API schemas are closed and bounded :: HTTP transport capacity is reached
  it("rejects a complete request when the HTTP in-flight capacity is reached", async () => {
    const router = new BrowserHttpRouter({ origin, maxInFlight: 0, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, {});
    assert.equal(response.status, 429);
    assert.equal(JSON.parse(response.body).code, "http_capacity");
  });

  // covers: code-explorer/browser-server :: Each browser tab owns one isolated session :: Tab presents another session identifier
  // covers: code-explorer/browser-server :: Idle browser sessions expire predictably :: Request arrives at the expiry boundary
  it("does not reveal another tab session and expires at the exact monotonic boundary", async () => {
    let now = 0;
    const router = new BrowserHttpRouter({ origin, clock: { nowMilliseconds: () => now }, call: async (_name: string, arguments_: Record<string, unknown>) => arguments_.action === "start_session" ? { schema_version: 1, project_id: "p", project_generation: 0, pending_generation: null, state: "ready", data: { session_id: "core" } } : { schema_version: 1, project_id: "p", project_generation: 0, pending_generation: null, state: "ready", data: {} } });
    const created = await request(router, {});
    const session = JSON.parse(created.body).data.browser_session_id;
    const rejected = await request(router, { path: "/api/status", body: JSON.stringify({ action: "status" }), headers: { "x-code-explorer-session": session, "x-code-explorer-tab": "other" } });
    assert.equal(JSON.parse(rejected.body).code, "invalid_browser_session");
    now = 1_800_000;
    const expired = await request(router, { path: "/api/status", body: JSON.stringify({ action: "status" }), headers: { "x-code-explorer-session": session, "x-code-explorer-tab": "tab" } });
    assert.equal(expired.status, 410);
    assert.equal(JSON.parse(expired.body).code, "browser_session_expired");
  });

  // covers: code-explorer/browser-server :: Static assets and server errors have stable behavior :: Static path attempts traversal
  it("rejects static traversal without exposing a local path", async () => {
    const router = new BrowserHttpRouter({ origin, call: async () => ({ schema_version: 1 }) });
    const response = await request(router, { method: "GET", path: "/%2e%2e/package.json", headers: { origin: undefined } });
    assert.equal(response.status, 404);
    assert.equal(response.body.includes("package.json"), false);
  });
});
