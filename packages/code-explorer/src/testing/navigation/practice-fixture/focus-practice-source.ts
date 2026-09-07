import { createServer } from "../../../index.js";

export async function focusPracticeSource(
  server: ReturnType<typeof createServer>,
) {
  const started = await server.call("code_status", {
    action: "start_session",
  });
  if ("code" in started || typeof started.data.session_id !== "string")
    throw new Error("expected session");
  const sessionId = started.data.session_id;
  const focused = await server.call("code_focus", {
    session_id: sessionId,
    request_id: "practice-focus-source-0001",
    symbol_id: "source",
  });
  if ("code" in focused) throw new Error("expected source focus");
  const source = focused.data as {
    view_id: string;
    handles: Array<{ name: string; handle: string }>;
  };
  const handle = source.handles.find(
    ({ name }) => name === "Destination",
  )?.handle;
  if (!handle) throw new Error("expected visible destination handle");
  return { sessionId, source, handle };
}
