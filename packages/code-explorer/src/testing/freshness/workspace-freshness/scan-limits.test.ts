import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";

it(
  "keeps the prior generation when a scan reaches a file, " +
    "size, or time bound",
  async () => {
    const { freshness, watcher, timers } = fixture([
      manifest({ "src/a.ts": "one" }),
      { cause: "scan_limit" },
    ]);
    await freshness.start();
    watcher.all?.();
    timers.fire(100);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(freshness.status().current_generation, 1);
    assert.equal(freshness.status().degraded_cause, "scan_limit");
  },
);
