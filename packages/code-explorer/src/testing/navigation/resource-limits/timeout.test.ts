import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { startSession } from "../support/start-session.js";
import { countingAdapter } from "./counting-adapter.js";

it(
  "returns retryable backend_timeout and releases the " + "backend slot",
  async () => {
    const server = createServer({
      backend_timeout_ms: 5,
      adapters: [
        countingAdapter(() => undefined, new Promise(() => undefined)),
      ],
    });
    const sessionId = await startSession(server);
    const result = await server.call("code_focus", {
      session_id: sessionId,
      request_id: "timeout-request-0001",
      symbol_id: "symbol",
    });
    assert.deepEqual(result, {
      schema_version: 1,
      code: "backend_timeout",
      message: "backend_timeout",
      retryable: true,
    });
  },
);
