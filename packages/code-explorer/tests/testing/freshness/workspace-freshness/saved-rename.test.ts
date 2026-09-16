import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";
import { settle } from "./settle.js";

it("publishes a changed final manifest for a saved rename", async () => {
  const { freshness, watcher, timers } = fixture([
    manifest({ "src/old.ts": "one" }),
    manifest({ "src/new.ts": "two" }),
  ]);
  await freshness.start();
  watcher.all?.();
  timers.fire(100);
  await settle();
  assert.deepEqual(freshness.status(), {
    current_generation: 2,
    pending_generation: null,
    state: "ready",
    mode: "watching",
  });
});
