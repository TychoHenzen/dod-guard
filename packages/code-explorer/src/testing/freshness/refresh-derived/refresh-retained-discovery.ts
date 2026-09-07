import { createServer } from "../../../index.js";
import { startSession } from "../../navigation/support/start-session.js";

export async function refreshRetainedDiscovery(
  server: ReturnType<typeof createServer>,
) {
  const id = await startSession(server);
  const prior = await server.call("code_search", { query: "retained" });
  const status = await server.call("code_status", {
    action: "refresh",
    session_id: id,
    request_id: "refresh-failure-01",
  });
  const later = await server.call("code_search", { query: "retained" });
  return { prior, status, later };
}
