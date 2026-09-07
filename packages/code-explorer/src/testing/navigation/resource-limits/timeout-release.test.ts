import assert from "node:assert/strict";
import { it } from "node:test";
import {
  BackendRequestLimiter,
  BackendTimeoutError,
} from "../../../navigation/resource-limits.js";
import { holdBackendRequests } from "./hold-backend-requests.js";

it("releases every timed-out slot for the same session", async () => {
  const limiter = new BackendRequestLimiter(5);
  const held = holdBackendRequests(limiter, Array(4).fill("timed"));
  const outcomes = await Promise.allSettled(held.active);
  try {
    for (const outcome of outcomes) {
      assert.equal(outcome.status, "rejected");
      if (outcome.status === "rejected")
        assert.ok(outcome.reason instanceof BackendTimeoutError);
    }
    const reused = Array.from({ length: 4 }, (_, index) =>
      limiter.run("timed", async () => index),
    );
    assert.deepEqual(await Promise.all(reused), [0, 1, 2, 3]);
  } finally {
    await held.release();
  }
});
