import assert from "node:assert/strict";
import { it } from "node:test";
import {
  BackendCapacityError,
  BackendRequestLimiter,
} from "../../../navigation/resource-limits.js";
import { holdBackendRequests } from "./hold-backend-requests.js";

it("bounds the project at eight calls across sessions", async () => {
  const limiter = new BackendRequestLimiter();
  const sessions = [...Array(4).fill("one"), ...Array(4).fill("two")];
  const held = holdBackendRequests(limiter, sessions);
  try {
    await assert.rejects(
      limiter.run(undefined, async () => "unexpected"),
      BackendCapacityError,
    );
    await assert.rejects(
      limiter.run("three", async () => "unexpected"),
      BackendCapacityError,
    );
  } finally {
    await held.release();
  }
  const reused = Array.from({ length: 8 }, (_, index) =>
    limiter.run(undefined, async () => index),
  );
  assert.deepEqual(await Promise.all(reused), [0, 1, 2, 3, 4, 5, 6, 7]);
});
