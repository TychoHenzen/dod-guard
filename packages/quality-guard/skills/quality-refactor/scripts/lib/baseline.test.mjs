import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compareToBaseline } from "./baseline.mjs";
import { readBaseline, writeBaseline } from "./baseline.mjs";
import { baselineOf, violation } from "./baseline-test-helpers.test.mjs";

test("buildBaseline records every scanned file, including clean ones", () => {
  const baseline = baselineOf(
    [violation("a.ts", "file-length")],
    ["b.ts", "a.ts", "a.ts"],
  );

  assert.equal(baseline.version, 2);
  assert.deepEqual(baseline.files, ["a.ts", "b.ts"]);
  assert.deepEqual(baseline.counts, { "a.ts::file-length": 1 });
  assert.equal(baseline.total, 1);
});

test("a file the baseline never scanned is adopted, not a regression", () => {
  const baseline = baselineOf([violation("old.ts", "complexity")], ["old.ts"]);
  const now = [
    violation("old.ts", "complexity"),
    violation("new.ts", "file-length"),
    violation("new.ts", "file-length"),
  ];

  const comparison = compareToBaseline(now, baseline, ["old.ts", "new.ts"]);

  assert.deepEqual(comparison.regressions, []);
  assert.deepEqual(comparison.newFiles, ["new.ts"]);
  assert.deepEqual(comparison.adopted, [
    { file: "new.ts", rule: "file-length", now: 2 },
  ]);
});

test("a clean new file is adopted with no violations recorded", () => {
  const baseline = baselineOf([], ["old.ts"]);

  const comparison = compareToBaseline([], baseline, ["old.ts", "new.ts"]);

  assert.deepEqual(comparison.newFiles, ["new.ts"]);
  assert.deepEqual(comparison.adopted, []);
  assert.deepEqual(comparison.regressions, []);
});

test(
  "a known file breaking a rule it never broke is a regression, not an " +
    "adoption",
  () => {
    const baseline = baselineOf([violation("a.ts", "complexity")], ["a.ts"]);
    const now = [
      violation("a.ts", "complexity"),
      violation("a.ts", "comment-bloat"),
    ];

    const comparison = compareToBaseline(now, baseline, ["a.ts"]);

    assert.deepEqual(comparison.regressions, [
      { file: "a.ts", rule: "comment-bloat", before: 0, now: 1 },
    ]);
    assert.deepEqual(comparison.adopted, []);
  },
);

test("a known file getting worse is still a regression", () => {
  const baseline = baselineOf([violation("a.ts", "complexity")], ["a.ts"]);
  const now = [
    violation("a.ts", "complexity"),
    violation("a.ts", "complexity"),
  ];

  const comparison = compareToBaseline(now, baseline, ["a.ts"]);

  assert.deepEqual(comparison.regressions, [
    { file: "a.ts", rule: "complexity", before: 1, now: 2 },
  ]);
  assert.deepEqual(comparison.newFiles, []);
});
