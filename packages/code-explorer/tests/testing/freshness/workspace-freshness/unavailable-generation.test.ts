import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";

it(
  "retains unavailable generation zero after the first " +
    "bounded reconciliation failure",
  async () => {
    const { freshness } = fixture([{ cause: "freshness_unavailable" }]);
    await freshness.start();
    assert.equal(freshness.status().current_generation, 0);
    assert.equal(freshness.status().state, "degraded");
  },
);
