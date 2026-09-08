import assert from "node:assert/strict";
import { createServer } from "../index.js";
import { startSession } from "./index-test-session-support.js";

export async function assertFileFallback(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  const result = await server.call("code_search", { query: "client.ts" });
  assert.equal("code" in result, false);
  if ("code" in result) throw new Error("expected file discovery response");
  assert.deepEqual(
    (result.data.candidates as { path: string }[]).map(({ path }) => path),
    ["src/client.ts"],
  );
  const candidate = (result.data.candidates as { identity: string }[])[0];
  const focused = await server.call("code_focus", {
    session_id: await startSession(server),
    request_id: "file-focus-request-0001",
    symbol_id: candidate?.identity,
  });
  assert.equal("code" in focused, false);
  if ("code" in focused) throw new Error("expected file focus response");
  assert.equal(focused.data.path, "src/client.ts");
  assert.match(
    (focused.data.content as { body: string }).body,
    /export const client/,
  );
}
