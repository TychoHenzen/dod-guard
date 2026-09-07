import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bindHistory, bindRefresh, showActionStatus } from "../../browser/application-events.js";
import { FakeElement, installDocumentFixture } from "./dom-fixture.test.js";

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe("application events", () => {
  it("shows explicit status and normalizes refresh errors", async () => {
    const status = new FakeElement();
    const refresh = new FakeElement();
    restore = installDocumentFixture({ '[data-area="status"]': status, '[data-operation="refresh"]': refresh });
    showActionStatus("ready");
    assert.equal(status.textContent, "ready");
    bindRefresh(
      {
        get: (key) => (key === "browser_session_id" ? "session" : "tab"),
        set: () => undefined,
        clear: () => undefined,
      },
      undefined,
      async () => {
        throw new Error("workspace_unavailable");
      },
    );
    refresh.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(status.textContent, "workspace_unavailable");
  });

  it("binds back and forward controls to their navigation actions", async () => {
    const back = new FakeElement();
    const forward = new FakeElement();
    restore = installDocumentFixture({
      '[data-operation="back"]': back,
      '[data-operation="forward"]': forward,
    });
    const actions: string[] = [];
    bindHistory((action) => {
      actions.push(action);
      return Promise.resolve();
    });
    back.click();
    forward.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(actions, ["back", "forward"]);
  });
});
