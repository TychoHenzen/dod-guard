import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { deduplicatePlans, diversityScore } from "./dedup.js";
import type { Plan } from "./types.js";

describe("deduplicatePlans", () => {
  it("returns empty for empty input", () => {
    assert.deepStrictEqual(deduplicatePlans([]), []);
  });

  it("keeps single plan", () => {
    const plans: Plan[] = [{ id: "1", summary: "Implement a simple fix" }];
    assert.equal(deduplicatePlans(plans).length, 1);
  });

  it("removes exact duplicates", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Add caching layer" },
      { id: "2", summary: "Add caching layer" },
    ];
    const result = deduplicatePlans(plans);
    assert.equal(result.length, 1, "should dedup exact matches");
    assert.equal(result[0].id, "1", "should keep first");
  });

  it("removes near-duplicates (case + punctuation)", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Add a caching layer." },
      { id: "2", summary: "add caching layer" },
    ];
    const result = deduplicatePlans(plans);
    assert.equal(result.length, 1, "should dedup after normalizing");
  });

  it("removes plans with high token overlap", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Add caching layer with Redis for performance optimization" },
      { id: "2", summary: "Add Redis caching layer for better performance" },
    ];
    const result = deduplicatePlans(plans);
    assert.equal(result.length, 1, "should dedup high-overlap plans");
  });

  it("keeps genuinely different plans", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Add Redis caching layer" },
      { id: "2", summary: "Rewrite database queries with joins" },
      { id: "3", summary: "Implement rate limiting middleware" },
    ];
    const result = deduplicatePlans(plans);
    assert.equal(result.length, 3, "should keep all distinct plans");
  });

  it("handles mixed duplicates and distinct plans", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Add Redis caching" },
      { id: "2", summary: "Rewrite DB queries" },
      { id: "3", summary: "add redis caching!" },
      { id: "4", summary: "Implement rate limiting" },
      { id: "5", summary: "rewrite db queries" },
    ];
    const result = deduplicatePlans(plans);
    assert.equal(result.length, 3, "should keep 3 distinct plans");
  });

  it("handles very short summaries", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Fix it" },
      { id: "2", summary: "Fix it now" },
    ];
    const result = deduplicatePlans(plans);
    // "Fix it" tokenizes to ["fix"] (2-char "it" discarded + "it" is stopword).
    // "Fix it now" → ["fix", "now"]. Overlap: 1/1 = 1.0 > 0.65 → duplicate.
    assert.equal(result.length, 1);
  });

  it("handles summaries with only stopwords", () => {
    const plans: Plan[] = [
      { id: "1", summary: "the a an" },
      { id: "2", summary: "the an a" },
    ];
    const result = deduplicatePlans(plans);
    // Tokenization discards all stopwords → both tokenize to [].
    // Empty token sets → isTooSimilar returns false (early exit).
    // But normalized signatures "the a an" ≠ "the an a" → no exact match.
    // So both kept — edge case, acceptable for plan dedup.
    assert.equal(result.length, 2);
  });
});

describe("diversityScore", () => {
  it("returns 1 for single plan", () => {
    assert.equal(diversityScore([{ id: "1", summary: "A" }]), 1);
  });

  it("returns moderate score for somewhat similar plans", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Add caching" },
      { id: "2", summary: "Add cache layer" },
    ];
    const score = diversityScore(plans);
    // Jaccard distance: tokens {add,caching} vs {add,cache,layer} → 1 - 1/4 = 0.75
    assert.ok(score > 0.5, `moderate similarity should score > 0.5, got ${score}`);
    assert.ok(score < 0.9, `but not complete diversity, got ${score}`);
  });

  it("returns high score for diverse plans", () => {
    const plans: Plan[] = [
      { id: "1", summary: "Add Redis caching" },
      { id: "2", summary: "Rewrite database queries" },
      { id: "3", summary: "Implement rate limiting" },
      { id: "4", summary: "Refactor authentication module" },
    ];
    const score = diversityScore(plans);
    assert.ok(score > 0.7, `diverse plans should score > 0.7, got ${score}`);
  });

  it("returns 1 for completely different plans", () => {
    const plans: Plan[] = [
      { id: "1", summary: "aabbcc" },
      { id: "2", summary: "xxyyzz" },
    ];
    const score = diversityScore(plans);
    assert.equal(score, 1, "no token overlap = diversity 1");
  });
});
