import assert from "node:assert/strict";
import { test } from "node:test";
import { abandonmentScore, normalizedBurstChurn } from "./fossil-grader.js";
import { activity } from "./fossil-grader.test-support.js";

test(
  "scores a positive burst with no later commits as complete abandonment",
  () => {
  const candidate = activity("src/abandoned.ts", 4);
  const invalid = activity("src/invalid.ts", 0);
  const before = structuredClone({ candidate, invalid });

  assert.equal(abandonmentScore(candidate), 1);
  assert.equal(abandonmentScore(invalid), 0);
  assert.equal(Number.isFinite(abandonmentScore(invalid)), true);
  assert.deepEqual({ candidate, invalid }, before);
});
test(
  "lowers abandonment linearly and floors it at zero after continued activity",
  () => {
  const partial = activity("src/partial.ts", 4, 2);
  const equal = activity("src/equal.ts", 4, 4);
  const greater = activity("src/greater.ts", 4, 5);
  const before = structuredClone({ partial, equal, greater });

  assert.equal(abandonmentScore(partial), 0.5);
  assert.equal(abandonmentScore(equal), 0);
  assert.equal(abandonmentScore(greater), 0);
  assert.deepEqual({ partial, equal, greater }, before);
});
test(
  "normalizes positive churn within one burst without mutating activity input",
  () => {
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
  assert.equal(
    Number.isFinite(normalizedBurstChurn(negative, [zero, negative])),
    true,
  );
});
