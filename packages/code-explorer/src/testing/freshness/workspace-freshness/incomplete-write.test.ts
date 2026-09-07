import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";

it(
  "degrades without publishing when stable sampling reports " +
    "an incomplete write",
  async () => {
    const { freshness } = fixture([{ cause: "incomplete_write" }]);
    await freshness.start();
    assert.deepEqual(freshness.status(), {
      current_generation: 0,
      pending_generation: null,
      state: "degraded",
      mode: "watching",
      degraded_cause: "incomplete_write",
    });
  },
);
