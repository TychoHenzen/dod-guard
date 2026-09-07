import { createServer } from "../../../index.js";

export async function visibleHandle(
  server: ReturnType<typeof createServer>,
  target: string,
) {
  const started = await server.call("code_status", { action: "start_session" });
  if ("code" in started || typeof started.data.session_id !== "string")
    throw new Error("expected session");
  const focused = await server.call("code_focus", {
    session_id: started.data.session_id,
    request_id: "focus-request-visible-1",
    symbol_id: "source",
  });
  if ("code" in focused) throw new Error("expected source focus");
  const view = focused.data as {
    view_id: string;
    handles: Array<{ name: string; handle: string }>;
  };
  const handle = view.handles.find(
    (candidate) => candidate.name === target,
  )?.handle;
  if (!handle) throw new Error("expected visible handle");
  return { sessionId: started.data.session_id, viewId: view.view_id, handle };
}
