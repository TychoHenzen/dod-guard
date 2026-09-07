import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrowserDiscoveryController,
  type DiscoveryReply,
  renderDiscovery,
} from "../../browser/discovery.js";
import { landmarkReplies } from "./discovery/landmark-replies.test.js";
import { fakeDiscoveryCore } from "./discovery-fixture.test.js";

import { deferred } from "./fixtures/deferred.test.js";

describe("browser discovery", () => {
  it(
    "shows grouped landmarks " + "without running a blank symbol search",
    async () => {
      const core = fakeDiscoveryCore(structuredClone(landmarkReplies));
      const discovery = new BrowserDiscoveryController(core.search, [
        {
          group: "Modules",
          items: [{ name: "lib", path: "src/lib.rs", kind: "module" }],
        },
      ]);
      await discovery.search("  ");
      assert.equal(core.calls.length, 0);
      assert.match(renderDiscovery(discovery.state()), /Modules/);
      assert.match(renderDiscovery(discovery.state()), /src\/lib\.rs/);
    },
  );
  it(
    "shows the service omitted " + "count and refinement guidance",
    async () => {
      const core = fakeDiscoveryCore([
        {
          data: {
            candidates: [],
            omitted_candidate_count: 17,
            refinement_guidance: "Add a path filter",
          },
        },
      ]);
      const discovery = new BrowserDiscoveryController(core.search);
      await discovery.search("parse");
      const html = renderDiscovery(discovery.state());
      assert.match(html, /17 omitted/);
      assert.match(html, /Add a path filter/);
    },
  );
  it("does not let an older response replace a newer search", async () => {
    const old = deferred<DiscoveryReply>();
    const fresh = deferred<DiscoveryReply>();
    const discovery = new BrowserDiscoveryController((request) =>
      request.query === "old" ? old.promise : fresh.promise,
    );
    const oldSearch = discovery.search("old");
    const freshSearch = discovery.search("fresh");
    fresh.resolve(fileReply("fresh.ts"));
    await freshSearch;
    old.resolve(fileReply("old.ts"));
    await oldSearch;
    assert.equal(discovery.state().query, "fresh");
    assert.equal(discovery.state().candidates[0]?.path, "fresh.ts");
  });
});

function fileReply(path: string): DiscoveryReply {
  return {
    data: {
      candidates: [
        { type: "file", path, match_class: "exact", match_score: 1 },
      ],
    },
  };
}
