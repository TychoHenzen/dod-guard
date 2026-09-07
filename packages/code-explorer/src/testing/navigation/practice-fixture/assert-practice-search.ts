import assert from "node:assert/strict";
import { createServer } from "../../../index.js";

export async function assertPracticeSearch(
  server: ReturnType<typeof createServer>,
) {
  const search = await server.call("code_search", { query: "helpertargt" });
  assert.equal("code" in search, false);
  if ("code" in search) throw new Error("expected fuzzy search result");
  assert.deepEqual(
    (search.data.candidates as Array<{ identity: string }>).map(
      ({ identity }) => identity,
    ),
    ["source"],
  );
}
