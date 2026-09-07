import assert from "node:assert/strict";
import { it } from "node:test";
import { WorkspaceFreshness } from "../../../freshness/workspace-freshness.js";
import { FakeTimers } from "./fake-timers.js";
import { FakeWatcher } from "./fake-watcher.js";
import { manifest } from "./manifest.js";

it(
  "coalesces duplicate and reordered events into one " + "reconciliation",
  async () => {
    let reconciliations = 0;
    const watcher = new FakeWatcher();
    const timers = new FakeTimers();
    const freshness = new WorkspaceFreshness({
      reconcile: async () => {
        reconciliations += 1;
        return manifest({ "src/a.ts": String(reconciliations) });
      },
      createWatcher: () => watcher,
      setTimeout: timers.set,
      clearTimeout: timers.clear,
    });
    await freshness.start();
    watcher.all?.();
    watcher.all?.();
    watcher.all?.();
    timers.fire(100);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(reconciliations, 2);
  },
);
