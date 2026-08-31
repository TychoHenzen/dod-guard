import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserDiscoveryController, renderDiscovery } from "./discovery.js";
import { BrowserRelationsController, renderRelationGroup } from "./relations.js";
import { BrowserWorkspaceController, renderBrowserArea } from "./states.js";

describe("browser local area states", () => {
  // covers: code-explorer/browser-navigation :: Empty, loading, and failure states preserve context :: Search has no matches
  it("renders a proved empty search result rather than a guessed replacement", async () => {
    const discovery = new BrowserDiscoveryController(async () => ({ data: { candidates: [] } }));

    await discovery.search("missing");

    assert.equal(discovery.state().areaState, "empty");
    assert.match(renderDiscovery(discovery.state()), /data-state="empty"/);
  });

  // covers: code-explorer/browser-navigation :: Empty, loading, and failure states preserve context :: One relation fails
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

  // covers: code-explorer/browser-navigation :: Empty, loading, and failure states preserve context :: Workspace has no published generation
  it("keeps the unavailable workspace cause visible and disables navigation at generation zero", () => {
    const workspace = new BrowserWorkspaceController();
    const state = workspace.update({
      generation: 0,
      workspace_state: "workspace_unavailable",
      readiness: "degraded",
      cause: "adapter_start_failed",
    });

    assert.equal(state.navigationEnabled, false);
    assert.equal(state.cause, "adapter_start_failed");
    assert.match(renderBrowserArea("workspace", "unavailable", state.cause), /adapter_start_failed/);
  });

  it("keeps all required local state labels distinct for every browser area", () => {
    const states = ["not_loaded", "loading", "empty", "unavailable", "stale", "failed"] as const;
    const areas = ["search", "relations", "graph", "freshness", "workspace"] as const;
    for (const area of areas)
      for (const state of states)
        assert.match(renderBrowserArea(area, state), new RegExp(`data-area="${area}" data-state="${state}"`));
  });
});
