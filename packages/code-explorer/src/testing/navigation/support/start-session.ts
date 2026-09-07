import { createServer } from "../../../index.js";

export async function startSession(
  server: ReturnType<typeof createServer>,
): Promise<string> {
  const result = await server.call("code_status", { action: "start_session" });
  if ("code" in result || typeof result.data.session_id !== "string")
    throw new Error("expected session");
  return result.data.session_id;
}
