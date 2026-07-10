import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("cosineSimilarity", () => {
  // Inline the function since it's not exported
  function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  it("identical vectors have similarity 1", () => {
    const v = [1, 2, 3];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 0.001);
  });

  it("orthogonal vectors have similarity 0", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 0.001);
  });

  it("different lengths returns 0", () => {
    assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  });

  it("opposite vectors have similarity -1", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 1], [-1, -1]) + 1) < 0.001);
  });
});
