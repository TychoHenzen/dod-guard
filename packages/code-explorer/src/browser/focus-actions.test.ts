import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { FakeElement, installDocumentFixture } from "./dom-fixture.test.js";
import { createFocusActions } from "./focus-actions.js";

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function focusReply(symbolId: string) {
  return {
    state: "ready",
    project_generation: 1,
    data: {
      view_id: `view-${symbolId}`,
      symbol_id: symbolId,
      name: symbolId,
      kind: "function",
      path: "src/main.ts",
      content: { body: `function ${symbolId}() {}`, returned_bytes: 20, total_bytes: 20, limit_bytes: 100 },
      handles: [],
    },
  };
}

describe("focus actions", () => {
  it("renders a successful navigation and reports ready", async () => {
    const source = new FakeElement();
    const graph = new FakeElement();
    const status = new FakeElement();
    const relations = new FakeElement();
    restore = installDocumentFixture({
      '[data-area="source"]': source,
      '[data-area="graph"]': graph,
      '[data-area="status"]': status,
      '[data-pane="relations"]': relations,
    });
    const { navigate } = createFocusActions({ get: () => "stored", set: () => undefined, clear: () => undefined });
    await navigate(async () => focusReply("main"));
    assert.match(source.innerHTML, /function main/);
    assert.match(graph.outerHTML, /data-area="graph"/);
    assert.equal(status.textContent, "ready");
    assert.equal(relations.dataset.state, "empty");
  });

  it("lets the newest navigation response win", async () => {
    const source = new FakeElement();
    restore = installDocumentFixture({ '[data-area="source"]': source });
    const { navigate } = createFocusActions({ get: () => "stored", set: () => undefined, clear: () => undefined });
    let release!: (value: ReturnType<typeof focusReply>) => void;
    const older = navigate(() => new Promise((resolve) => (release = resolve)));
    await navigate(async () => focusReply("newer"));
    release(focusReply("older"));
    await older;
    assert.match(source.innerHTML, /function newer/);
    assert.doesNotMatch(source.innerHTML, /function older/);
  });
});
