import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { FakeElement, installDocumentFixture } from "./dom-fixture.test.js";
import { bindSourceRelations, resetSourceRelations } from "./source-relations.js";

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe("source relations", () => {
  it("resets the relation pane to its empty state", () => {
    const pane = new FakeElement();
    restore = installDocumentFixture({ '[data-pane="relations"]': pane });
    resetSourceRelations();
    assert.equal(pane.dataset.state, "empty");
    assert.deepEqual(
      pane.children.map((child) => child.textContent),
      ["Relations", "No relations loaded"],
    );
  });

  it("offers only declared relations for a complete source handle", () => {
    const pane = new FakeElement();
    const mark = new FakeElement();
    mark.dataset.handle = "handle-main";
    mark.dataset.viewId = "view-main";
    mark.dataset.relations = "definition callers";
    restore = installDocumentFixture({ '[data-pane="relations"]': pane }, { "mark[data-handle]": [mark] });
    bindSourceRelations({ get: () => "stored", set: () => undefined, clear: () => undefined }, async () => undefined);
    mark.click();
    assert.equal(pane.dataset.state, "empty");
    assert.deepEqual(
      pane.children.map((child) => child.textContent),
      ["Relations", "No relations loaded", "definition", "callers"],
    );
  });
});
