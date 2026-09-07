import assert from "node:assert/strict";
import { it } from "node:test";
import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";
import { FakeTimers } from "./fake-timers.js";
import { manifest } from "./manifest.js";

it(
  "falls back to five-second polling after watcher startup " + "fails",
  async () => {
    const timers = new FakeTimers();
    const freshness = new WorkspaceFreshness({
      reconcile: async () => manifest({ "src/a.ts": "one" }),
      createWatcher: () => {
        throw new Error("unavailable");
      },
      setTimeout: timers.set,
      clearTimeout: timers.clear,
    });
    await freshness.start(1);
    assert.equal(freshness.status().mode, "polling");
    assert.ok(timers.entries.some(({ delay }) => delay === 5000));
  },
);
