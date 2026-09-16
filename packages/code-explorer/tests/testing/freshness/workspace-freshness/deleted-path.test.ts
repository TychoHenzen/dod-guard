import assert from "node:assert/strict";
import { it } from "node:test";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";
import { settle } from "./settle.js";

it("publishes deletion only from the final manifest", async () => {
  const { freshness, watcher, timers } = fixture([
    manifest({ "src/removed.ts": "one" }),
    manifest({}),
  ]);
  await freshness.start();
  watcher.all?.();
  timers.fire(100);
  await settle();
  assert.equal(freshness.status().current_generation, 2);
});
