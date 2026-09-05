import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bindHistory, showActionError, showActionStatus } from "./application-events.js";
import { FakeElement, installDocumentFixture } from "./dom-fixture.test.js";

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe("application events", () => {
  it("shows explicit and normalized error status", () => {
    const status = new FakeElement();
    restore = installDocumentFixture({ '[data-area="status"]': status });
    showActionStatus("ready");
    assert.equal(status.textContent, "ready");
    showActionError(new Error("workspace_unavailable"));
    assert.equal(status.textContent, "workspace_unavailable");
    showActionError("unknown");
    assert.equal(status.textContent, "backend_unavailable");
  });

  it("binds back and forward controls to their navigation actions", async () => {
    const back = new FakeElement();
    const forward = new FakeElement();
    restore = installDocumentFixture({
      '[data-operation="back"]': back,
      '[data-operation="forward"]': forward,
    });
    const actions: string[] = [];
    bindHistory({ get: () => "stored", set: () => undefined, clear: () => undefined }, async (request) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (_path, options) => {
        actions.push(JSON.parse(String(options?.body)).action);
        return new Response(JSON.stringify({ state: "ready" }));
      };
      try {
        await request();
      } finally {
        globalThis.fetch = original;
      }
    });
    back.click();
    forward.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(actions, ["back", "forward"]);
  });
});
