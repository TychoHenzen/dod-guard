import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { assertReferenceCandidates } from "./assert-reference-candidates.js";
import { relationAdapter } from "./relation-adapter.js";
import { visibleHandle } from "./visible-handle.js";

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
