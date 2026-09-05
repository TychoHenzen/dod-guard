import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserDiscoveryController, renderDiscovery } from "./discovery.js";
import { fakeDiscoveryCore } from "./discovery-fixture.test.js";

describe("browser discovery results", () => {
  it("renders fuzzy candidates in the service order with labels and scores", async () => {
    const core = fakeDiscoveryCore([
      {
        data: {
          candidates: [
            {
              type: "symbol",
              identity: "parse-config",
              name: "parse_config",
              match_class: "fuzzy",
              match_score: 82,
              path: "src/config.rs",
              kind: "function",
            },
            {
              type: "symbol",
              identity: "parser",
              name: "parser",
              match_class: "fuzzy",
              match_score: 71,
              path: "src/parser.rs",
              kind: "struct",
            },
          ],
        },
      },
    ]);
    const discovery = new BrowserDiscoveryController(core.search);
    await discovery.search("prase");
    const html = renderDiscovery(discovery.state());
    assert.match(html, /fuzzy 82/);
    assert.ok(html.indexOf("parse_config") < html.indexOf("parser"));
    assert.deepEqual(core.calls[0], { query: "prase" });
  });

  it("renders file candidates returned by the discovery service", async () => {
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
  });

  it("sends combined filters and replaces rather than merges results", async () => {
    const core = fakeDiscoveryCore([
      {
        data: {
          candidates: [
            {
              type: "symbol",
              identity: "production",
              name: "production",
              match_class: "exact",
              match_score: 100,
              path: "src/main.ts",
              kind: "function",
            },
          ],
        },
      },
    ]);
    const discovery = new BrowserDiscoveryController(core.search);
    await discovery.search("main", {
      path_globs: ["src/**"],
      languages: ["typescript"],
      kinds: ["function"],
      content: "production",
      include_generated: false,
    });
    assert.deepEqual(core.calls[0], {
      query: "main",
      path_globs: ["src/**"],
      languages: ["typescript"],
      kinds: ["function"],
      content: "production",
      include_generated: false,
    });
    const [candidate] = discovery.state().candidates;
    assert.equal(candidate?.type, "symbol");
    assert.equal(candidate?.type === "symbol" ? candidate.name : undefined, "production");
  });
});
