import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrowserDiscoveryController,
  renderDiscovery,
} from "../../../browser/discovery.js";
import { fakeDiscoveryCore } from "../discovery-fixture.test.js";
import { rankingReplies } from "./ranking-replies.test.js";

describe("browser discovery results", () => {
  it(
    "renders fuzzy candidates in the " + "service order with labels and scores",
    async () => {
      const core = fakeDiscoveryCore(structuredClone(rankingReplies));
      const discovery = new BrowserDiscoveryController(core.search);
      await discovery.search("prase");
      const html = renderDiscovery(discovery.state());
      assert.match(html, /fuzzy 82/);
      assert.ok(html.indexOf("parse_config") < html.indexOf("parser"));
      assert.deepEqual(core.calls[0], { query: "prase" });
    },
  );
});
