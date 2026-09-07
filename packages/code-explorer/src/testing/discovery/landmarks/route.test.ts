import assert from "node:assert/strict";
import { it } from "node:test";
import { landmarkServer } from "./server-fixture.js";

it(
  "returns a ready but empty landmark set without running " + "ordinary search",
  async () => {
    const fixture = landmarkServer("route", { state: "ready", landmarks: [] });
    try {
      const result = await fixture.server.call("code_search", { query: "" });
      assert.equal("code" in result, false);
      if ("code" in result) throw new Error("expected landmark result");
      assert.equal(result.state, "ready");
      assert.deepEqual(result.data, { landmarks: [], landmark_state: "ready" });
      assert.equal(fixture.searches(), 0);
    } finally {
      fixture.close();
    }
  },
);

it(
  "routes whitespace-only queries to the same not-ready " + "landmark path",
  async () => {
    const fixture = landmarkServer("route");
    try {
      const result = await fixture.server.call("code_search", {
        query: " \u00a0",
      });
      assert.equal("code" in result, false);
      if ("code" in result) throw new Error("expected landmark result");
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
