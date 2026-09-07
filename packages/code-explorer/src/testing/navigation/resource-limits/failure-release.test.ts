import assert from "node:assert/strict";
import { it } from "node:test";
import { BackendRequestLimiter } from "../../../navigation/resource-limits.js";

it(
  "releases slots after synchronous throws and rejected " + "promises",
  async () => {
    const limiter = new BackendRequestLimiter();
    const failure = new Error("backend fixture failure");
    const operations = [
      () => {
        throw failure;
      },
      () => Promise.reject(failure),
    ];
    for (const operation of operations) {
      const failed = Array.from({ length: 4 }, () =>
        limiter.run("failed", operation),
      );
      assert.deepEqual(
        await Promise.allSettled(failed),
        Array(4).fill({ status: "rejected", reason: failure }),
      );
      const reused = Array.from({ length: 4 }, (_, index) =>
        limiter.run("failed", async () => index),
      );
      assert.deepEqual(await Promise.all(reused), [0, 1, 2, 3]);
    }
  },
);
