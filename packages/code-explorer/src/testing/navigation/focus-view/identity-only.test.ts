import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import {
  createFocusView,
  stableSymbolId,
} from "../../../navigation/focus-view.js";
import { startSession } from "../support/start-session.js";
import { focusAdapter } from "./focus-adapter.js";
import { symbol } from "./symbol.js";

it(
  "returns semantic identity without reading a whole file " +
    "when the backend supplies no content",
  async () => {
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
  },
);
