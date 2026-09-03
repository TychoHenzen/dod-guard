import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserRelationsController, type RelationReply, renderRelationGroup } from "./relations.js";

describe("lazy browser relations", () => {
  it("starts supported and unavailable groups without eager relation requests", () => {
    const calls: Record<string, unknown>[] = [];
    const relations = new BrowserRelationsController(
      { view_id: "view-1", handle: "source-handle", supported: ["definition", "references"], unavailable: ["callers"] },
      async (request) => {
        calls.push(request);
        return { state: "ok" };
      },
    );
    assert.equal(relations.state("definition").state, "not_loaded");
    assert.equal(relations.state("callers").state, "unavailable");
    assert.equal(calls.length, 0);
  });
  it("dispatches one bounded follow request for an opened group and caches its result", async () => {
    const calls: Record<string, unknown>[] = [];
    const relations = new BrowserRelationsController(
      { view_id: "view-1", handle: "source-handle", supported: ["references"], unavailable: [] },
      async (request) => {
        calls.push(request);
        return { state: "ok", data: { candidates: [{ name: "reference", external: false }], omitted_count: 3 } };
      },
    );
    await relations.open("references");
    await relations.open("references");
    assert.deepEqual(calls, [{ view_id: "view-1", handle: "source-handle", relation: "references", limit: 200 }]);
    assert.equal(relations.state("references").state, "loaded");
    assert.equal(relations.state("references").omitted_count, 3);
  });
  it("keeps an unavailable relation closed without a substitute request", async () => {
    const relations = new BrowserRelationsController(
      { view_id: "view-1", handle: "source-handle", supported: [], unavailable: ["callees"] },
      async () => {
        throw new Error("must_not_dispatch");
      },
    );
    await relations.open("callees");
    assert.equal(relations.state("callees").state, "unavailable");
    assert.match(renderRelationGroup(relations.state("callees")), /unavailable/);
  });
  it("renders external results as display-only identities", async () => {
    const relations = new BrowserRelationsController(
      { view_id: "view-1", handle: "source-handle", supported: ["definition"], unavailable: [] },
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
