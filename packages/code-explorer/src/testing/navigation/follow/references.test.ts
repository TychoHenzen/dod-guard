import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { assertReferenceCandidates } from "./assert-reference-candidates.js";
import { relationAdapter } from "./relation-adapter.js";
import { visibleHandle } from "./visible-handle.js";

async function assertBoundedRelationHistory(input: {
  server: ReturnType<typeof createServer>;
  sessionId: string;
  viewId: string;
  handle: string;
}): Promise<void> {
  const response = await input.server.call("code_follow", {
    session_id: input.sessionId,
    request_id: "references-capacity-request-01",
    view_id: input.viewId,
    handle: input.handle,
    relation: "references",
    limit: 1,
  });
  assert.equal("code" in response, false);
  if ("code" in response) throw new Error("expected bounded references");
  assert.equal(response.state, "ready");
  assert.equal((response.data.candidates as unknown[]).length, 1);
  const history = await input.server.call("code_history", {
    session_id: input.sessionId,
    request_id: "references-capacity-history-01",
    action: "recent",
    limit: 64,
  });
  assert.equal("code" in history, false);
  if ("code" in history) throw new Error("expected bounded relation history");
  const historyData = history.data as { views: unknown[] };
  assert.equal(historyData.views.length, 2);
}

it(
  "returns bounded deterministic source-located references " +
    "with next-focus handles",
  async () => {
    const server = createServer({ adapters: [relationAdapter("references")] });
    const { sessionId, viewId, handle } = await visibleHandle(
      server,
      "reference",
    );
    const response = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "references-request-01",
      view_id: viewId,
      handle,
      relation: "references",
      limit: 1,
    });
    assert.equal("code" in response, false);
    if ("code" in response) throw new Error("expected references");
    const candidates = response.data.candidates as Array<{
      path: string;
      handle: string;
      view_id: string;
      external: boolean;
    }>;
    assertReferenceCandidates(candidates);
  },
);

it("retains only the bounded relation response as session views", async () => {
  const server = createServer({
    adapters: [relationAdapter("references", {}, 65)],
  });
  const { sessionId, viewId, handle } = await visibleHandle(
    server,
    "reference",
  );
  await assertBoundedRelationHistory({
    server,
    sessionId,
    viewId,
    handle,
  });
});
