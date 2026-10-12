import assert from "node:assert/strict";
import { it } from "node:test";
import { WorkspaceFreshness } from "../../../../src/freshness/workspace-freshness.js";
import { FakeTimers } from "./fake-timers.js";
import { manifest } from "./manifest.js";

it(
  "falls back to five-second polling after watcher startup " + "fails",
  async () => {
    const timers = new FakeTimers();
    let reconciliations = 0;
    const freshness = new WorkspaceFreshness({
      reconcile: async () => {
        reconciliations += 1;
        return manifest({ "src/a.ts": "one" });
      },
      createWatcher: () => {
        throw new Error("unavailable");
      },
      setTimeout: timers.set,
      clearTimeout: timers.clear,
    });
    await freshness.start();
    assert.equal(freshness.status().mode, "polling");
    assert.equal(reconciliations, 1);
    timers.fire(5000);
    await drain();
    assert.equal(reconciliations, 2);
    timers.fire(5000);
    await drain();
    assert.equal(reconciliations, 3);
  },
);

it("close stops polling", async () => {
  const scheduled: Array<{ id: number; delay: number; callback: () => void }> =
    [];
  const cleared: unknown[] = [];
  let nextId = 0;
  let reconciliations = 0;
  const freshness = new WorkspaceFreshness({
    reconcile: async () => {
      reconciliations += 1;
      return manifest({ "src/a.ts": "one" });
    },
    createWatcher: () => {
      throw new Error("unavailable");
    },
    setTimeout: (callback, delay) => {
      const id = ++nextId;
      scheduled.push({ id, delay, callback });
      return id;
    },
    clearTimeout: (timer) => {
      cleared.push(timer);
    },
  });
  await freshness.start();
  const poll = scheduled[0];
  assert.ok(poll);
  assert.equal(poll.delay, 5000);
  await freshness.close();
  assert.deepEqual(cleared, [poll.id]);
  poll.callback();
  await drain();
  assert.equal(reconciliations, 2);
  assert.equal(scheduled.length, 1);
});

function drain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
