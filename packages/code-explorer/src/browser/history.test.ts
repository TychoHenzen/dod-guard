import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserViewHistory, type BrowserViewSnapshot } from "./history.js";

function view(view_id: string, symbol_id: string): BrowserViewSnapshot {
  return {
    view_id,
    symbol_id,
    source: { body: `source ${view_id}` },
    relations: { references: [view_id] },
    graph: { center: view_id },
    stale: false,
  };
}

describe("browser view history", () => {
  // covers: code-explorer/browser-navigation :: Back and Forward restore explicit views :: User selects Back
  it("restores the prior immutable source, relation, graph, and history position without a request", () => {
    const old = view("view-old", "old");
    const current = view("view-current", "current");
    const history = new BrowserViewHistory(old);
    history.append(current);
    current.source.body = "mutated outside history";

    const restored = history.back();

    assert.equal(restored?.view_id, "view-old");
    assert.deepEqual(restored?.source, { body: "source view-old" });
    assert.deepEqual(restored?.relations, { references: ["view-old"] });
    assert.deepEqual(restored?.graph, { center: "view-old" });
    assert.deepEqual(history.state(), {
      entries: [view("view-old", "old"), view("view-current", "current")],
      position: 0,
    });
  });

  // covers: code-explorer/browser-navigation :: Back and Forward restore explicit views :: User selects Forward
  it("restores the next recorded view after Back", () => {
    const history = new BrowserViewHistory(view("view-old", "old"));
    history.append(view("view-current", "current"));
    history.back();

    const restored = history.forward();

    assert.equal(restored?.view_id, "view-current");
    assert.deepEqual(restored?.source, { body: "source view-current" });
    assert.equal(history.state().position, 1);
  });

  // covers: code-explorer/browser-navigation :: Back and Forward restore explicit views :: User navigates after Back
  it("replaces the abandoned Forward branch and its snapshots after new navigation", () => {
    const history = new BrowserViewHistory(view("view-old", "old"));
    history.append(view("view-forward", "forward"));
    history.back();
    history.append(view("view-replacement", "replacement"));

    assert.deepEqual(
      history.state().entries.map((entry) => entry.view_id),
      ["view-old", "view-replacement"],
    );
    assert.equal(history.state().position, 1);
    assert.equal(history.forward(), undefined);
  });
});
