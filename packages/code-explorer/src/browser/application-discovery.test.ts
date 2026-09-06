import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderDiscoveryArea } from "./application-discovery.js";
import { BrowserDiscoveryController } from "./discovery.js";
import { FakeElement, installDocumentFixture } from "./dom-fixture.test.js";

describe("application discovery bindings", () => {
  it("renders landmarks and focuses the selected symbol", () => {
    const host = new FakeElement();
    const symbol = new FakeElement();
    symbol.dataset.symbolId = "symbol-main";
    const restore = installDocumentFixture({ '[data-area="discovery"]': host }, { "[data-symbol-id]": [symbol] });
    try {
      const discovery = new BrowserDiscoveryController(
        async () => ({ data: {} }),
        [
          {
            group: "entry_points",
            items: [{ symbol_id: "symbol-main", name: "main", path: "src/main.ts", kind: "function" }],
          },
        ],
      );
      const focused: string[] = [];
      renderDiscoveryArea(discovery, (symbolId) => focused.push(symbolId));

      assert.equal(host.innerHTML.includes('data-discovery="landmarks"'), true);
      symbol.click();
      assert.deepEqual(focused, ["symbol-main"]);
    } finally {
      restore();
    }
  });
});
