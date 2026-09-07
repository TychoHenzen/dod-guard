import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrowserDiscoveryController,
  renderDiscovery,
} from "../../../browser/discovery.js";
import { fakeDiscoveryCore } from "../discovery-fixture.test.js";

describe("browser discovery results", () => {
  it(
    "renders file candidates " + "returned by the discovery service",
    async () => {
      const core = fakeDiscoveryCore([
        {
          data: {
            candidates: [
              {
                type: "file",
                path: "src/browser/client.ts",
                identity: "file:src/browser/client.ts",
                match_class: "fuzzy",
                match_score: 78,
                classification: "production",
              },
            ],
            omitted_candidate_count: 3,
          },
        },
      ]);
      const discovery = new BrowserDiscoveryController(core.search);
      await discovery.search("client");
      const html = renderDiscovery(discovery.state());
      assert.match(html, /client\.ts/);
      assert.match(html, /src\/browser\/client\.ts/);
      assert.match(html, /file/);
      assert.match(html, /fuzzy 78/);
      assert.match(html, /3 omitted/);
    },
  );
});
