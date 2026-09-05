import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserDiscoveryController, renderDiscovery } from "./discovery.js";
import { fakeDiscoveryCore } from "./discovery-fixture.test.js";

describe("browser discovery", () => {
  it("shows grouped landmarks without running a blank symbol search", async () => {
    const core = fakeDiscoveryCore([
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
    const core = fakeDiscoveryCore([
      { data: { candidates: [], omitted_candidate_count: 17, refinement_guidance: "Add a path filter" } },
    ]);
    const discovery = new BrowserDiscoveryController(core.search);
    await discovery.search("parse");
    const html = renderDiscovery(discovery.state());
    assert.match(html, /17 omitted/);
    assert.match(html, /Add a path filter/);
  });
});
