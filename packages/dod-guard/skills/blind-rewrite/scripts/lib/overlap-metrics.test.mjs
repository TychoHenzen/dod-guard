import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  identicalLineRate,
  ngramOverlap,
  orderSimilarity,
} from "./overlap-metrics.mjs";

describe("ngramOverlap", () => {
  const original = ["a", "b", "c", "d", "e"];

  it("scores an identical token run as full overlap", () => {
    assert.equal(ngramOverlap(original, ["a", "b", "c", "d", "e"], 4), 1);
  });

  it("scores one changed trailing token as half overlap", () => {
    assert.equal(ngramOverlap(original, ["a", "b", "c", "d", "z"], 4), 0.5);
  });

  it("scores an unrelated token run as zero", () => {
    assert.equal(ngramOverlap(original, ["q", "r", "s", "t"], 4), 0);
  });

  it("scores a run shorter than the window as zero", () => {
    assert.equal(ngramOverlap(original, ["a", "b"], 4), 0);
  });
});

describe("identicalLineRate", () => {
  const original = "const limit = computeLimit(input);\nreturn limit * scale;\n";

  it("scores a verbatim copy as one", () => {
    assert.equal(identicalLineRate(original, original), 1);
  });

  it("scores one kept line out of two as one half", () => {
    const rewrite = "const limit = computeLimit(input);\nreturn other(limit);\n";
    assert.equal(identicalLineRate(original, rewrite), 0.5);
  });

  it("ignores indentation changes", () => {
    const rewrite = "    const limit = computeLimit(input);\n";
    assert.equal(identicalLineRate(original, rewrite), 1);
  });

  it("exempts lines holding a whitelisted boundary token", () => {
    const rewrite = "const limit = computeLimit(input);\n";
    assert.equal(identicalLineRate(original, rewrite, ["computeLimit"]), 0);
  });
});

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
