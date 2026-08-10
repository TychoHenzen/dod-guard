import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adoptNewFiles, buildBaseline, compareToBaseline, readBaseline, writeBaseline } from "./baseline.mjs";

function violation(file, rule) {
  return { file, rule, line: 1, severity: "warn", message: rule };
}

function baselineOf(violations, files) {
  return buildBaseline(violations, "default", files);
}

test("buildBaseline records every scanned file, including clean ones", () => {
  const baseline = baselineOf([violation("a.ts", "file-length")], ["b.ts", "a.ts", "a.ts"]);

  assert.equal(baseline.version, 2);
  assert.deepEqual(baseline.files, ["a.ts", "b.ts"]);
  assert.deepEqual(baseline.counts, { "a.ts::file-length": 1 });
  assert.equal(baseline.total, 1);
});

test("a file the baseline never scanned is adopted, not a regression", () => {
  const baseline = baselineOf([violation("old.ts", "complexity")], ["old.ts"]);
  const now = [violation("old.ts", "complexity"), violation("new.ts", "file-length"), violation("new.ts", "file-length")];

  const comparison = compareToBaseline(now, baseline, ["old.ts", "new.ts"]);

  assert.deepEqual(comparison.regressions, []);
  assert.deepEqual(comparison.newFiles, ["new.ts"]);
  assert.deepEqual(comparison.adopted, [{ file: "new.ts", rule: "file-length", now: 2 }]);
});

test("a clean new file is adopted with no violations recorded", () => {
  const baseline = baselineOf([], ["old.ts"]);

  const comparison = compareToBaseline([], baseline, ["old.ts", "new.ts"]);

  assert.deepEqual(comparison.newFiles, ["new.ts"]);
  assert.deepEqual(comparison.adopted, []);
  assert.deepEqual(comparison.regressions, []);
});

test("a known file breaking a rule it never broke is a regression, not an adoption", () => {
  const baseline = baselineOf([violation("a.ts", "complexity")], ["a.ts"]);
  const now = [violation("a.ts", "complexity"), violation("a.ts", "comment-bloat")];

  const comparison = compareToBaseline(now, baseline, ["a.ts"]);

  assert.deepEqual(comparison.regressions, [{ file: "a.ts", rule: "comment-bloat", before: 0, now: 1 }]);
  assert.deepEqual(comparison.adopted, []);
});

test("a known file getting worse is still a regression", () => {
  const baseline = baselineOf([violation("a.ts", "complexity")], ["a.ts"]);
  const now = [violation("a.ts", "complexity"), violation("a.ts", "complexity")];

  const comparison = compareToBaseline(now, baseline, ["a.ts"]);

  assert.deepEqual(comparison.regressions, [{ file: "a.ts", rule: "complexity", before: 1, now: 2 }]);
  assert.deepEqual(comparison.newFiles, []);
});

test("a known file getting better is an improvement", () => {
  const baseline = baselineOf([violation("a.ts", "complexity"), violation("a.ts", "complexity")], ["a.ts"]);

  const comparison = compareToBaseline([violation("a.ts", "complexity")], baseline, ["a.ts"]);

  assert.deepEqual(comparison.improvements, [{ file: "a.ts", rule: "complexity", before: 2, now: 1 }]);
  assert.deepEqual(comparison.regressions, []);
});

test("a deleted file counts as fixed", () => {
  const baseline = baselineOf([violation("gone.ts", "complexity")], ["gone.ts", "a.ts"]);

  const comparison = compareToBaseline([], baseline, ["a.ts"]);

  assert.deepEqual(comparison.improvements, [{ file: "gone.ts", rule: "complexity", before: 1, now: 0 }]);
  assert.deepEqual(comparison.regressions, []);
});

test("extracting a module out of a big file is not a regression", () => {
  const before = [violation("big.ts", "file-length"), violation("big.ts", "complexity")];
  const baseline = baselineOf(before, ["big.ts"]);
  const after = [violation("big.ts", "complexity"), violation("extracted.ts", "complexity")];

  const comparison = compareToBaseline(after, baseline, ["big.ts", "extracted.ts"]);

  assert.deepEqual(comparison.regressions, []);
  assert.deepEqual(comparison.improvements, [{ file: "big.ts", rule: "file-length", before: 1, now: 0 }]);
  assert.deepEqual(comparison.adopted, [{ file: "extracted.ts", rule: "complexity", now: 1 }]);
});

test("adopted files are held to their recorded counts on the next run", () => {
  const baseline = baselineOf([violation("old.ts", "complexity")], ["old.ts"]);
  const firstRun = [violation("old.ts", "complexity"), violation("new.ts", "file-length")];
  const scanned = ["old.ts", "new.ts"];

  const first = compareToBaseline(firstRun, baseline, scanned);
  const tightened = adoptNewFiles(baseline, firstRun, first.adopted);

  assert.deepEqual(tightened.files, ["new.ts", "old.ts"]);
  assert.equal(tightened.counts["new.ts::file-length"], 1);
  assert.equal(tightened.total, 2);

  const worse = [violation("old.ts", "complexity"), violation("new.ts", "file-length"), violation("new.ts", "file-length")];
  const second = compareToBaseline(worse, tightened, scanned);

  assert.deepEqual(second.newFiles, []);
  assert.deepEqual(second.regressions, [{ file: "new.ts", rule: "file-length", before: 1, now: 2 }]);
});

test("adoption leaves untouched files' counts alone", () => {
  const baseline = baselineOf([violation("old.ts", "complexity")], ["old.ts"]);

  const tightened = adoptNewFiles(baseline, [violation("new.ts", "file-length")], [{ file: "new.ts", rule: "file-length", now: 1 }]);

  assert.equal(tightened.counts["old.ts::complexity"], 1);
});

test("readBaseline rejects a baseline with no files list", () => {
  const dir = mkdtempSync(join(tmpdir(), "quality-baseline-"));
  const path = join(dir, "baseline.json");
  writeFileSync(path, JSON.stringify({ version: 1, profile: "default", total: 0, counts: {} }));

  assert.throws(() => readBaseline(path), /version 1.*needs version 2/s);
});

test("writeBaseline output round-trips through readBaseline", () => {
  const dir = mkdtempSync(join(tmpdir(), "quality-baseline-"));
  const path = join(dir, "baseline.json");
  const baseline = baselineOf([violation("a.ts", "complexity")], ["a.ts"]);

  writeBaseline(path, baseline);

  assert.deepEqual(readBaseline(path), baseline);
});
