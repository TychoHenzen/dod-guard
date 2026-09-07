import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { startSession } from "../support/start-session.js";
import { countingAdapter } from "./counting-adapter.js";

it(
  "rejects oversized query, filter, candidate, and body " +
    "limits before backend dispatch",
  async () => {
    let calls = 0;
    const server = createServer({ adapters: [countingAdapter(() => calls++)] });
    const sessionId = await startSession(server);
    const requests: Array<[string, Record<string, unknown>]> = [
      ["code_search", { query: "x".repeat(1025) }],
      [
        "code_search",
        { query: "x", path_globs: Array.from({ length: 33 }, () => "src/**") },
      ],
      ["code_search", { query: "x", limit: 201 }],
      [
        "code_focus",
        {
          session_id: sessionId,
          request_id: "body-limit-request-1",
          symbol_id: "symbol",
          body_limit_bytes: 131_073,
        },
      ],
    ];
    for (const [name, arguments_] of requests) {
      const result = await server.call(name, arguments_);
      assert.equal("code" in result && result.code, "resource_limit");
    }
    assert.equal(calls, 0);
  },
);
