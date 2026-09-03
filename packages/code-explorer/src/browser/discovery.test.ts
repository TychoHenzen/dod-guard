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
            { name: "parse_config", match_class: "fuzzy", score: 0.82, path: "src/config.rs", kind: "function" },
            { name: "parser", match_class: "fuzzy", score: 0.71, path: "src/parser.rs", kind: "struct" },
          ],
        },
      },
    ]);
    const discovery = new BrowserDiscoveryController(core.search);
    await discovery.search("prase");
    assert.match(renderDiscovery(discovery.state()), /fuzzy 0.82/);
    assert.ok(
      renderDiscovery(discovery.state()).indexOf("parse_config") < renderDiscovery(discovery.state()).indexOf("parser"),
    );
    assert.deepEqual(core.calls[0], { query: "prase" });
  });
  it("sends the combined filters and replaces rather than merges results", async () => {
    const core = fakeCore([
      {
        data: {
          candidates: [{ name: "production", match_class: "exact", score: 1, path: "src/main.ts", kind: "function" }],
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
    assert.equal(discovery.state().candidates[0]?.name, "production");
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
    const core = fakeCore([{ data: { candidates: [], omitted_count: 17, refinement_guidance: "Add a path filter" } }]);
    const discovery = new BrowserDiscoveryController(core.search);
    await discovery.search("parse");
    const html = renderDiscovery(discovery.state());
    assert.match(html, /17 omitted/);
    assert.match(html, /Add a path filter/);
  });
});
