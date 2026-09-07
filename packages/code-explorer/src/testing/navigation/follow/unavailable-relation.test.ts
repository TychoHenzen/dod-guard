import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { relationAdapter } from "./relation-adapter.js";
import { visibleHandle } from "./visible-handle.js";

it(
  "reports unavailable relations without relabeling " + "references as calls",
  async () => {
    const server = createServer({
      adapters: [
        relationAdapter("references", { callers: { state: "unavailable" } }),
      ],
    });
    const { sessionId, viewId, handle } = await visibleHandle(
      server,
      "callable",
    );
    const response = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "unavailable-request-01",
      view_id: viewId,
      handle,
      relation: "callers",
    });
    assert.equal("code" in response, false);
    if ("code" in response) throw new Error("expected unavailable relation");
    assert.equal(response.state, "unavailable_relation");
    assert.deepEqual(response.data, { relation: "callers" });
  },
);
