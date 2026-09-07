import assert from "node:assert/strict";
import { it } from "node:test";
import { type ReconcileResult } from "../../../freshness/reconcile-result.js";
import { deferred } from "./deferred.js";
import { fixture } from "./fixture.js";
import { manifest } from "./manifest.js";

it(
  "marks the refresh state until an overflow reconciliation " + "completes",
  async () => {
    const next = deferred<ReconcileResult>();
    const { freshness, watcher, timers } = fixture([
      manifest({ "src/a.ts": "one" }),
      next.promise,
    ]);
    await freshness.start();
    watcher.error?.();
    timers.fire(100);
    await Promise.resolve();
    assert.equal(freshness.status().state, "refreshing");
    next.resolve(manifest({ "src/a.ts": "two" }));
    await Promise.resolve();
  },
);
