import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserDiscoveryController, renderDiscovery } from "./discovery.js";

type Reply = { data: Record<string, unknown> };
function fakeCore(replies: Reply[]) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    search: async (request: Record<string, unknown>) => {
      calls.push(request);
      const reply = replies.shift();
      if (!reply) throw new Error("missing_fake_reply");
      return reply;
    },
  };
}

describe("browser discovery", () => {
  it("renders fuzzy candidates in the exact service order with their labels and scores", async () => {
    const core = fakeCore([
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
    assert.match(renderDiscovery(discovery.state()), /fuzzy 82/);
    assert.ok(
      renderDiscovery(discovery.state()).indexOf("parse_config") < renderDiscovery(discovery.state()).indexOf("parser"),
    );
    assert.deepEqual(core.calls[0], { query: "prase" });
  });
  it("renders file candidates returned by the discovery service", async () => {
    const core = fakeCore([
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
  it("sends the combined filters and replaces rather than merges results", async () => {
    const core = fakeCore([
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
  it("shows grouped landmarks without running a blank symbol search", async () => {
    const core = fakeCore([
      { data: { landmarks: [{ group: "Modules", items: [{ name: "lib", path: "src/lib.rs", kind: "module" }] }] } },
    ]);
    const discovery = new BrowserDiscoveryController(core.search, [
      { group: "Modules", items: [{ name: "lib", path: "src/lib.rs", kind: "module" }] },
    ]);
    await discovery.search("  ");
    assert.equal(core.calls.length, 0);
    assert.match(renderDiscovery(discovery.state()), /Modules/);
    assert.match(renderDiscovery(discovery.state()), /src\/lib\.rs/);
  });
  it("shows the service omitted count and refinement guidance", async () => {
    const core = fakeCore([
      { data: { candidates: [], omitted_candidate_count: 17, refinement_guidance: "Add a path filter" } },
    ]);
    const discovery = new BrowserDiscoveryController(core.search);
    await discovery.search("parse");
    const html = renderDiscovery(discovery.state());
    assert.match(html, /17 omitted/);
    assert.match(html, /Add a path filter/);
  });
});
