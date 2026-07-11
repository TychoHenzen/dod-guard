import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNumber } from "./regression.js";

test("extractNumber uses capture group 1 when an extract regex is given", () => {
  assert.equal(
    extractNumber("coverage: 87.5% of lines", "coverage:\\s*([\\d.]+)"),
    87.5,
    "extract: capture group should yield 87.5 from coverage output",
  );
  assert.equal(
    extractNumber("score 12 then total 999", "score\\s+(\\d+)"),
    12,
    "extract: capture group 1 wins over later numbers in stdout",
  );
});

test("extractNumber falls back to the LAST number when no regex is given", () => {
  assert.equal(
    extractNumber("ran 5 tests in 3 files, mean 42 ms"),
    42,
    "no-extract: last number (42) should be extracted",
  );
  assert.equal(
    extractNumber("complexity report\nworst function = 17"),
    17,
    "no-extract: last number (17) extracted from multiline output",
  );
});

test("extractNumber parses decimals and negatives", () => {
  assert.equal(extractNumber("benchmark mean 3.14 ms"), 3.14, "decimals: 3.14 should be parsed as float");
  assert.equal(extractNumber("delta from baseline: -5"), -5, "negatives: -5 should be parsed as negative integer");
  assert.equal(extractNumber("regressed by -2.5 percent"), -2.5, "negatives: -2.5 should be parsed as negative float");
});

test("extractNumber returns null when no number is present (fail-safe)", () => {
  assert.equal(
    extractNumber("no numeric metric in this output"),
    null,
    "fail-safe: text output with no numbers should return null",
  );
  assert.equal(extractNumber(""), null, "fail-safe: empty string should return null");
  assert.equal(
    extractNumber("coverage missing", "coverage:\\s*([\\d.]+)"),
    null,
    "fail-safe: regex mismatch should return null, not fallback to other numbers",
  );
});
