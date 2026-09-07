import { createServer } from "../../../index.js";
import { startSession } from "../support/start-session.js";
import { focusAdapter } from "./focus-adapter.js";

export async function focusTwice() {
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
  const sessionId = await startSession(server);

  const first = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0001",
    symbol_id: "backend-id",
  });
  const second = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0002",
    symbol_id: "backend-id",
  });
  return { first, second };
}
