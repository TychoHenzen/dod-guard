import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  adoptNewFiles,
  compareToBaseline,
  readBaseline,
  writeBaseline,
} from "./baseline.mjs";
import { baselineOf, violation } from "./baseline-test-helpers.test.mjs";

test("extracting a module is not a regression", () => {
  const baseline = baselineOf(
    [violation("big.ts", "file-length"), violation("big.ts", "complexity")],
    ["big.ts"],
  );
  const after = [
    violation("big.ts", "complexity"),
    violation("extracted.ts", "complexity"),
  ];
  const comparison = compareToBaseline(after, baseline, [
    "big.ts",
    "extracted.ts",
  ]);
  assert.deepEqual(comparison.regressions, []);
  assert.deepEqual(comparison.improvements, [
    { file: "big.ts", rule: "file-length", before: 1, now: 0 },
  ]);
  assert.deepEqual(comparison.adopted, [
    { file: "extracted.ts", rule: "complexity", now: 1 },
  ]);
});

test("adopted files are held to their counts on the next run", () => {
  const baseline = baselineOf([violation("old.ts", "complexity")], ["old.ts"]);
  const firstRun = [
    violation("old.ts", "complexity"),
    violation("new.ts", "file-length"),
  ];
  const scanned = ["old.ts", "new.ts"];
  const first = compareToBaseline(firstRun, baseline, scanned);
  const tightened = adoptNewFiles(baseline, firstRun, first.adopted);
  assert.deepEqual(tightened.files, ["new.ts", "old.ts"]);
  assert.equal(tightened.counts["new.ts::file-length"], 1);
  const worse = [...firstRun, violation("new.ts", "file-length")];
  assert.deepEqual(compareToBaseline(worse, tightened, scanned).regressions, [
    { file: "new.ts", rule: "file-length", before: 1, now: 2 },
  ]);
});

test("adoption leaves untouched files alone", () => {
  const baseline = baselineOf([violation("old.ts", "complexity")], ["old.ts"]);
  const tightened = adoptNewFiles(
    baseline,
    [violation("new.ts", "file-length")],
    [{ file: "new.ts", rule: "file-length", now: 1 }],
  );
  assert.equal(tightened.counts["old.ts::complexity"], 1);
});

test("baseline read and write enforce the file-list contract", () => {
  const dir = mkdtempSync(join(tmpdir(), "quality-baseline-"));
  const path = join(dir, "baseline.json");
  writeFileSync(
    path,
    JSON.stringify({ version: 1, profile: "default", total: 0, counts: {} }),
  );
  assert.throws(() => readBaseline(path), /version 1.*needs version 2/s);
  const baseline = baselineOf([violation("a.ts", "complexity")], ["a.ts"]);
  writeBaseline(path, baseline);
  assert.deepEqual(readBaseline(path), baseline);
});
