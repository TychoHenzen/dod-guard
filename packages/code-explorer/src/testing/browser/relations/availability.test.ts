import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrowserRelationsController,
  type RelationReply,
  renderRelationGroup,
} from "../../../browser/relations.js";

describe("lazy browser relations", () => {
  it(
    "keeps an unavailable relation " + "closed without a substitute request",
    async () => {
      const relations = new BrowserRelationsController(
        {
          view_id: "view-1",
          handle: "source-handle",
          supported: [],
          unavailable: ["callees"],
        },
        async () => {
          throw new Error("must_not_dispatch");
        },
      );
      await relations.open("callees");
      assert.equal(relations.state("callees").state, "unavailable");
      assert.match(
        renderRelationGroup(relations.state("callees")),
        /unavailable/,
      );
    },
  );
  it("renders external results as display-only identities", async () => {
    const relations = new BrowserRelationsController(
      {
        view_id: "view-1",
        handle: "source-handle",
        supported: ["definition"],
        unavailable: [],
      },
      async (): Promise<RelationReply> => ({
        state: "ok",
        data: { candidates: [{ name: "std::io::Read", external: true }] },
      }),
    );
    await relations.open("definition");
    const html = renderRelationGroup(relations.state("definition"));
    assert.match(html, /std::io::Read/);
    assert.doesNotMatch(html, /hidden|data-focus/);
  });
});
