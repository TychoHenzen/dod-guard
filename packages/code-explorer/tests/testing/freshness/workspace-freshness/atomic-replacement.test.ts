import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";
import { settle } from "./settle.js";

it("treats an atomic replacement as a changed final path", async () => {
  const { freshness, watcher, timers } = fixture([
    manifest({ "src/a.ts": "old" }),
    manifest({ "src/a.ts": "new" }),
  ]);
  await freshness.start();
  watcher.all?.();
  watcher.all?.();
  timers.fire(100);
  await settle();
  assert.equal(freshness.status().current_generation, 2);
});
