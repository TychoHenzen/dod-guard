import assert from "node:assert/strict";
import { it } from "node:test";
import { type ReconcileResult } from "../../../freshness/reconcile-result.js";
import { deferred } from "./deferred.js";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";
import { settle } from "./settle.js";

it(
  "reports the prior revision and a pending revision while " +
    "reconciliation runs",
  async () => {
    const next = deferred<ReconcileResult>();
    const { freshness, watcher, timers } = fixture([
      manifest({ "src/a.ts": "one" }),
      next.promise,
    ]);
    await freshness.start();
    watcher.all?.();
    timers.fire(100);
    await Promise.resolve();
    assert.deepEqual(freshness.status(), {
      current_generation: 1,
      pending_generation: 2,
      state: "refreshing",
      mode: "watching",
    });
    next.resolve(manifest({ "src/a.ts": "two" }));
    await settle();
  },
);
