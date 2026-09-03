import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../index.js";
import type { LanguageAdapter } from "../semantic/language-adapter.js";

it("rejects oversized query, filter, candidate, and body limits before backend dispatch", async () => {
  let calls = 0;
  const server = createServer({ adapters: [countingAdapter(() => calls++)] });
  const sessionId = await startSession(server);
  const requests: Array<[string, Record<string, unknown>]> = [
    ["code_search", { query: "x".repeat(1025) }],
    ["code_search", { query: "x", path_globs: Array.from({ length: 33 }, () => "src/**") }],
    ["code_search", { query: "x", limit: 201 }],
    [
      "code_focus",
      { session_id: sessionId, request_id: "body-limit-request-1", symbol_id: "symbol", body_limit_bytes: 131_073 },
    ],
  ];
  for (const [name, arguments_] of requests) {
    const result = await server.call(name, arguments_);
    assert.equal("code" in result && result.code, "resource_limit");
  }
  assert.equal(calls, 0);
});
it("returns retryable backend_timeout and releases the backend slot", async () => {
  const server = createServer({
    backend_timeout_ms: 5,
    adapters: [countingAdapter(() => undefined, new Promise(() => undefined))],
  });
  const sessionId = await startSession(server);
  const result = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "timeout-request-0001",
    symbol_id: "symbol",
  });
  assert.deepEqual(result, { schema_version: 1, code: "backend_timeout", message: "backend_timeout", retryable: true });
});
it("joins an active project refresh instead of starting another adapter refresh", async () => {
  let refreshes = 0;
  let release: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => (release = resolve));
  const server = createServer({
    adapters: [
      {
        ...countingAdapter(() => undefined),
        refresh: async () => {
          refreshes += 1;
          await wait;
        },
      },
    ],
  });
  const one = await startSession(server);
  const two = await startSession(server);
  const first = server.call("code_status", { action: "refresh", session_id: one, request_id: "refresh-request-0001" });
  await new Promise((resolve) => setImmediate(resolve));
  const second = server.call("code_status", { action: "refresh", session_id: two, request_id: "refresh-request-0002" });
  release?.();
  await Promise.all([first, second]);
  assert.equal(refreshes, 1);
});
it("rejects oversized filter values and serialized requests before any backend dispatch", async () => {
  let calls = 0;
  const server = createServer({ adapters: [countingAdapter(() => calls++)] });
  for (const arguments_ of [
    { query: "x", path_globs: ["x".repeat(257)] },
    { query: "x", path_globs: ["x".repeat(65 * 1024)] },
  ]) {
    const result = await server.call("code_search", arguments_);
    assert.equal("code" in result && result.code, "resource_limit");
  }
  assert.equal(calls, 0);
});

async function startSession(server: ReturnType<typeof createServer>): Promise<string> {
  const result = await server.call("code_status", { action: "start_session" });
  if ("code" in result || typeof result.data.session_id !== "string") throw new Error("expected session");
  return result.data.session_id;
}

function countingAdapter(onRequest: () => void, pending?: Promise<never>): LanguageAdapter {
  return {
    status: () => ({
      language: "rust",
      backend_name: "fixture",
      backend_version: "1",
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
      onRequest();
      if (pending) return pending;
      throw new Error("unexpected backend request");
    },
  };
}
