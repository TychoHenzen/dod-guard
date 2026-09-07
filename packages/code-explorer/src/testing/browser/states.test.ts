import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserDiscoveryController, renderDiscovery } from "../../browser/discovery.js";
import { BrowserRelationsController, renderRelationGroup } from "../../browser/relations.js";

describe("browser local area states", () => {
  it("renders a proved empty search result rather than a guessed replacement", async () => {
    const discovery = new BrowserDiscoveryController(async () => ({ data: { candidates: [] } }));

    await discovery.search("missing");

    assert.equal(discovery.state().areaState, "empty");
    assert.match(renderDiscovery(discovery.state()), /data-state="empty"/);
  });
  it("contains a failed relation group without removing another loaded group", async () => {
    const relations = new BrowserRelationsController(
      { view_id: "view", handle: "handle", supported: ["references", "callers"], unavailable: [] },
      async ({ relation }) =>
        relation === "references"
          ? { state: "ok", data: { candidates: [{ name: "reference", external: false }] } }
          : { state: "backend_unavailable" },
    );
    await relations.open("references");
    await relations.open("callers");

    assert.match(renderRelationGroup(relations.state("references")), /reference/);
    assert.match(renderRelationGroup(relations.state("callers")), /data-state="failed"/);
  });
});
