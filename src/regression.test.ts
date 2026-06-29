import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNumber } from "./regression.js";

test("extractNumber uses capture group 1 when an extract regex is given", () => {
  assert.equal(extractNumber("coverage: 87.5% of lines", "coverage:\\s*([\\d.]+)"), 87.5);
  // The captured group wins even when other numbers appear later in stdout.
  assert.equal(extractNumber("score 12 then total 999", "score\\s+(\\d+)"), 12);
});

test("extractNumber falls back to the LAST number in stdout when no regex is given", () => {
  assert.equal(extractNumber("ran 5 tests in 3 files, mean 42 ms"), 42);
  assert.equal(extractNumber("complexity report\nworst function = 17"), 17);
});

test("extractNumber parses decimals and negatives", () => {
  assert.equal(extractNumber("benchmark mean 3.14 ms"), 3.14);
  assert.equal(extractNumber("delta from baseline: -5"), -5);
  assert.equal(extractNumber("regressed by -2.5 percent"), -2.5);
});

test("extractNumber returns null when no number is present (fail-safe)", () => {
  assert.equal(extractNumber("no numeric metric in this output"), null);
  assert.equal(extractNumber(""), null);
  // Regex given but it does not match => null, never a silent fallback to a
  // stray number elsewhere in the output.
  assert.equal(extractNumber("coverage missing", "coverage:\\s*([\\d.]+)"), null);
});
