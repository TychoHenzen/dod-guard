import { createServer } from "../../../index.js";
import { createFocusView } from "../../../navigation/focus-view.js";

export async function focusOldView(
  server: ReturnType<typeof createServer>,
  sessionId: string,
) {
  const focused = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "focus-request-0001",
    symbol_id: "backend-id",
  });
  if ("code" in focused) throw new Error("expected focus view");
  const view = focused.data as ReturnType<typeof createFocusView>;
  return { view };
}
