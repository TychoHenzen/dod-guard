import assert from "node:assert/strict";
import { test } from "node:test";
import { abandonmentScore, normalizedBurstChurn } from "./fossil-grader.js";
import type { BurstFileActivity } from "./types.js";

function activity(path: string, burstCommits: number, postBurstCommits = 0): BurstFileActivity {
  return {
    identity: path,
    path,
    burstCommits,
    postBurstCommits,
    createdInBurst: true,
    existsAtHead: true,
  };
}

// covers: fossil/scoring :: Abandonment score :: Complete abandonment scores one
test("scores a positive burst with no later commits as complete abandonment", () => {
  const candidate = activity("src/abandoned.ts", 4);
  const invalid = activity("src/invalid.ts", 0);
  const before = structuredClone({ candidate, invalid });

  assert.equal(abandonmentScore(candidate), 1);
  assert.equal(abandonmentScore(invalid), 0);
  assert.equal(Number.isFinite(abandonmentScore(invalid)), true);
  assert.deepEqual({ candidate, invalid }, before);
});

// covers: fossil/scoring :: Churn score :: Churn is normalized within a burst
test("normalizes positive churn within one burst without mutating activity input", () => {
  const candidate = activity("src/candidate.ts", 12);
  const maximum = activity("src/maximum.ts", 15);
  const before = structuredClone({ candidate, maximum });

  assert.equal(normalizedBurstChurn(candidate, [candidate, maximum]), 0.8);
  assert.equal(normalizedBurstChurn(maximum, [candidate, maximum]), 1);
  assert.deepEqual({ candidate, maximum }, before);
});

test("gives each tied positive maximum full normalized churn", () => {
  const first = activity("src/first.ts", 15);
  const second = activity("src/second.ts", 15);

  assert.equal(normalizedBurstChurn(first, [first, second]), 1);
  assert.equal(normalizedBurstChurn(second, [first, second]), 1);
});

test("returns finite zero for empty and nonpositive burst activity", () => {
  const zero = activity("src/zero.ts", 0);
  const negative = activity("src/negative.ts", -2);

  assert.equal(normalizedBurstChurn(zero, []), 0);
  assert.equal(normalizedBurstChurn(negative, [zero, negative]), 0);
  assert.equal(Number.isFinite(normalizedBurstChurn(negative, [zero, negative])), true);
});
