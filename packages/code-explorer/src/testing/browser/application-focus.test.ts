import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApplicationFocusController } from "../../browser/application-focus.js";
import { FakeElement, installDocumentFixture } from "./dom-fixture.test.js";
import { BrowserFocusNavigation } from "../../browser/focus-navigation.js";
import { BrowserRelationView } from "../../browser/relations.js";

const storage = { get: () => null, set: () => undefined, clear: () => undefined };

describe("application focus controller", () => {
  it("reports ready after focusing a symbol", async () => {
    const status = new FakeElement();
    const restore = installDocumentFixture({ '[data-area="status"]': status });
    try {
      const navigation = new BrowserFocusNavigation(undefined, async () => ({
        state: "ok",
        data: { view_id: "view-main", symbol_id: "symbol-main", name: "main" },
      }));
      const relationView = new BrowserRelationView(storage, navigation);
      await new ApplicationFocusController(navigation, relationView).focusSymbol("symbol-main");
      assert.equal(status.textContent, "ready");
    } finally {
      restore();
    }
  });

  it("reports the navigation error when focusing fails", async () => {
    const status = new FakeElement();
    const restore = installDocumentFixture({ '[data-area="status"]': status });
    try {
      const navigation = new BrowserFocusNavigation(undefined, async () => ({ state: "backend_unavailable" }));
      const relationView = new BrowserRelationView(storage, navigation);
      await new ApplicationFocusController(navigation, relationView).focusSymbol("missing");
      assert.equal(status.textContent, "backend_unavailable");
    } finally {
      restore();
    }
  });
});
