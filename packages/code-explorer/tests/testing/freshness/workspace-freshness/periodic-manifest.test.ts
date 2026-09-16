import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";
import { settle } from "./settle.js";

it(
  "reconciles an active session manifest every thirty " + "seconds",
  async () => {
    const { freshness, timers } = fixture([
      manifest({ "src/a.ts": "one" }),
      manifest({ "src/a.ts": "two" }),
    ]);
    await freshness.start(1);
    timers.fire(30_000);
    await settle();
    assert.equal(freshness.status().current_generation, 2);
  },
);
