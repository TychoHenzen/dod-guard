import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";
import { settle } from "./settle.js";

it(
  "keeps the prior generation when reconciliation cannot " +
    "read a supported path",
  async () => {
    const { freshness, watcher, timers } = fixture([
      manifest({ "src/a.ts": "one" }),
      { cause: "freshness_unavailable" },
    ]);
    await freshness.start();
    watcher.all?.();
    timers.fire(100);
    await settle();
    assert.deepEqual(freshness.status(), {
      current_generation: 1,
      pending_generation: null,
      state: "degraded",
      mode: "watching",
      degraded_cause: "freshness_unavailable",
    });
  },
);
