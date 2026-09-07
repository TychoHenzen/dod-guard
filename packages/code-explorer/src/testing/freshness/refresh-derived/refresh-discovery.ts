import { createServer } from "../../../index.js";
import { startSession } from "../../navigation/support/start-session.js";

export async function refreshDiscovery(
  server: ReturnType<typeof createServer>,
) {
  const id = await startSession(server);
  const before = await server.call("code_search", { query: "before" });
  const status = await server.call("code_status", {
    action: "refresh",
    session_id: id,
    request_id: "refresh-success-0001",
  });
  const after = await server.call("code_search", { query: "after" });
  return { before, status, after };
}
