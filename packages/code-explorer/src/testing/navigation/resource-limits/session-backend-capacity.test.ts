import assert from "node:assert/strict";
import { it } from "node:test";
import {
  BackendCapacityError,
  BackendRequestLimiter,
} from "../../../navigation/resource-limits.js";
import { holdBackendRequests } from "./hold-backend-requests.js";

it(
  "bounds each session at four calls and releases completed " + "slots",
  async () => {
    const limiter = new BackendRequestLimiter();
    const held = holdBackendRequests(limiter, Array(4).fill("one"));
    let dispatched = false;
    try {
      await assert.rejects(
        limiter.run("one", async () => {
          dispatched = true;
        }),
        BackendCapacityError,
      );
      assert.equal(dispatched, false);
      assert.equal(await limiter.run("two", async () => 7), 7);
    } finally {
      await held.release();
    }
    const reused = Array.from({ length: 4 }, (_, index) =>
      limiter.run("one", async () => index),
    );
    assert.deepEqual(await Promise.all(reused), [0, 1, 2, 3]);
  },
);
