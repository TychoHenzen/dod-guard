import assert from "node:assert/strict";
import { test } from "node:test";
import { compareToBaseline } from "./baseline.mjs";
import { baselineOf, violation } from "./baseline-test-helpers.test.mjs";

test("a known file getting better is an improvement", () => {
  const baseline = baselineOf(
    [violation("a.ts", "complexity"), violation("a.ts", "complexity")],
    ["a.ts"],
  );

  const comparison = compareToBaseline(
    [violation("a.ts", "complexity")],
    baseline,
    ["a.ts"],
  );

  assert.deepEqual(comparison.improvements, [
    { file: "a.ts", rule: "complexity", before: 2, now: 1 },
  ]);
  assert.deepEqual(comparison.regressions, []);
});

test("a deleted file counts as fixed", () => {
  const baseline = baselineOf(
    [violation("gone.ts", "complexity")],
    ["gone.ts", "a.ts"],
  );

  const comparison = compareToBaseline([], baseline, ["a.ts"]);

  assert.deepEqual(comparison.improvements, [
    { file: "gone.ts", rule: "complexity", before: 1, now: 0 },
  ]);
  assert.deepEqual(comparison.regressions, []);
});
