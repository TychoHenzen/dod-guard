import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { caller } from "./caller.js";
import { relationAdapter } from "./relation-adapter.js";
import { visibleHandle } from "./visible-handle.js";

it(
  "returns only backend-proven callers and callees with " + "call sites",
  async () => {
    for (const relation of ["callers", "callees"] as const) {
      const server = createServer({ adapters: [relationAdapter(relation)] });
      const { sessionId, viewId, handle } = await visibleHandle(
        server,
        "callable",
      );
      const response = await server.call("code_follow", {
        session_id: sessionId,
        request_id: `${relation}-request-00001`,
        view_id: viewId,
        handle,
        relation,
      });
      assert.equal("code" in response, false);
      if ("code" in response) throw new Error("expected call result");
      const candidate = (
        response.data.candidates as Array<{
          relation_source: string;
          call_site: unknown;
        }>
      )[0];
      assert.equal(candidate.relation_source, "semantic");
      assert.deepEqual(candidate.call_site, {
        path: "src/caller.rs",
        range: caller.location.range,
      });
    }
  },
);
