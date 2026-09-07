import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserDiscoveryController } from "../../../browser/discovery.js";
import { fakeDiscoveryCore } from "../discovery-fixture.test.js";
import { filterReplies } from "./filter-replies.test.js";

describe("browser discovery results", () => {
  it(
    "sends combined filters and " + "replaces rather than merges results",
    async () => {
      const core = fakeDiscoveryCore(structuredClone(filterReplies));
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
      assert.equal(
        candidate?.type === "symbol" ? candidate.name : undefined,
        "production",
      );
    },
  );
});
