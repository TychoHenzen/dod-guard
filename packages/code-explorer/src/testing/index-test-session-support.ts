import { createServer } from "../index.js";

export async function startSession(
  server: ReturnType<typeof createServer>,
): Promise<string> {
  const response = await server.call("code_status", {
    action: "start_session",
  });
  if ("code" in response || typeof response.data.session_id !== "string")
    throw new Error("expected session");
  return response.data.session_id;
}
