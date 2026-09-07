import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { definitionFocus } from "./definition-focus.js";
import { relationAdapter } from "./relation-adapter.js";
import { type } from "./type.js";
import { visibleHandle } from "./visible-handle.js";

it(
  "focuses a project-local definition and cites its source " + "location",
  async () => {
    const server = createServer({ adapters: [relationAdapter("definition")] });
    const { sessionId, viewId, handle } = await visibleHandle(server, "type");
    const response = await server.call("code_follow", {
      session_id: sessionId,
      request_id: "definition-request-001",
      view_id: viewId,
      handle,
      relation: "definition",
    });
    assert.equal("code" in response, false);
    if ("code" in response) throw new Error("expected definition");
    assert.equal(response.state, "ready");
    const { focus } = definitionFocus(response);
    assert.deepEqual(response.data.source_location, type.location.range);
    assert.equal(focus.relation, "definition");
    assert.equal(focus.relation_source, "semantic");
    assert.equal(focus.backend_name, "fixture-lsp");
    assert.equal(focus.display_name, "Type");
    assert.equal(focus.path, "src/types.rs");
    assert.equal(focus.kind, "struct");
    assert.deepEqual(focus.range, type.location.range);
    assert.equal(focus.external, false);
    assert.equal(typeof focus.view_id, "string");
    assert.equal(typeof focus.handle, "string");
  },
);
