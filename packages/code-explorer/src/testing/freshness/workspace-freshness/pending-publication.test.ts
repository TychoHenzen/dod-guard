import assert from "node:assert/strict";
import { it } from "node:test";
import { type ReconcileResult } from "../../../freshness/reconcile-result.js";
import { deferred } from "./deferred.js";
import { manifest } from "./manifest.js";
import { pendingPublicationFixture } from "./pending-publication-fixture.js";

it(
  "keeps the prior generation current while a reserved " +
    "generation is pending",
  async () => {
    const next = deferred<ReconcileResult>();
    const { freshness } = pendingPublicationFixture(next);
    await freshness.start();
    const current = freshness.status().current_generation;
    const refresh = freshness.reconcile();
    assert.deepEqual(freshness.status(), {
      current_generation: current,
      pending_generation: current + 1,
      state: "refreshing",
      mode: "watching",
    });
    next.resolve(manifest({ "src/a.ts": "two" }));
    await refresh;
    assert.deepEqual(freshness.status(), {
      current_generation: current + 1,
      pending_generation: null,
      state: "ready",
      mode: "watching",
    });
  },
);
