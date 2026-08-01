import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderSimilarity } from "./overlap-metrics.mjs";

describe("orderSimilarity", () => {
  it("scores a preserved subsequence as one", () => {
    assert.equal(orderSimilarity(["a", "b", "c"], ["a", "c"]), 1);
  });

  it("scores a reordered pair as one half", () => {
    assert.equal(orderSimilarity(["a", "b", "c"], ["c", "a"]), 0.5);
  });

  it("scores an empty rewrite as zero", () => {
    assert.equal(orderSimilarity(["a"], []), 0);
  });
});
