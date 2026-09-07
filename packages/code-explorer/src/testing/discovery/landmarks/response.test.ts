import assert from "node:assert/strict";
import { it } from "node:test";
import { landmarksNotReady } from "../../../discovery/landmarks.js";
import { boundedEntries } from "./bounded-entries-fixture.js";
import { landmarkServer } from "./server-fixture.js";

it(
  "returns bounded grouped landmarks with selectable symbol " +
    "identities for an empty query",
  async () => {
    const fixture = landmarkServer("response", boundedEntries());
    try {
      const result = await fixture.server.call("code_search", { query: "" });
      assert.equal("code" in result, false);
      if ("code" in result) throw new Error("expected landmarks");
      assert.equal(result.state, "ready");
      const groups = result.data.landmarks as Array<{
        group: string;
        symbols: Array<{ symbol_id: string }>;
      }>;
      assert.deepEqual(
        groups.map(({ group }) => group),
        ["entry_points"],
      );
      assert.equal(groups[0]?.symbols.length, 12);
      assert.equal(groups[0]?.symbols[0]?.symbol_id, "entry-0");
      assert.equal(fixture.searches(), 0);
    } finally {
      fixture.close();
    }
  },
);

it(
  "reports landmark initialization without substituting " +
    "ordinary search candidates",
  async () => {
    const fixture = landmarkServer("response", landmarksNotReady());
    try {
      const result = await fixture.server.call("code_search", { query: "" });
      assert.equal("code" in result, false);
      if ("code" in result)
        throw new Error("expected landmark readiness response");
      assert.equal(result.state, "landmarks_not_ready");
      assert.deepEqual(result.data, {
        landmarks: [],
        landmark_state: "landmarks_not_ready",
      });
      assert.equal(fixture.searches(), 0);
    } finally {
      fixture.close();
    }
  },
);
