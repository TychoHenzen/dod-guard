import { createServer } from "../../../index.js";

export async function evictPracticeViews(
  server: ReturnType<typeof createServer>,
  sessionId: string,
) {
  for (let index = 0; index < 64; index += 1) {
    const result = await server.call("code_focus", {
      session_id: sessionId,
      request_id: `practice-eviction-${index.toString().padStart(8, "0")}`,
      symbol_id: "source",
    });
    if ("code" in result)
      throw new Error("expected fixture focus while evicting views");
  }
}
