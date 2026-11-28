// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
import { scannerCandidates, unchangedAtBase } from "./finding-ids.mjs";
import { gateModules, markPreexisting } from "./scan-baseline.mjs";
import { scannerReview } from "./scanner-review.test-support.mjs";

// The repository's own quality-guard, laid out as the installed plugin is, so a
// rename of the gate modules fails this test instead of a live review.
const SCANNER = fileURLToPath(
  new URL("../../../../../../packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs", import.meta.url),
);
const MISSING_GATE = /lacks pr-gate-compare\.mjs.*update quality-guard/;
const INFO_SECTION =
  /<details>\n<summary>Unchanged at base \(info\)<\/summary>\n\n[^\n]+\n\n- `src\/Old\.cs` `duplicate-block` x1\n\n<\/details>$/;
const NO_MINOR_NOTES = /### Minor notes/;
const MINOR_LINE = /`src\/Old\.cs:10` 1 quality-guard finding: `line-length` x1$/m;

const finding = (file, message, extra = {}) => ({
  file,
  line: 10,
  rule: "duplicate-block",
  severity: "high",
  message,
  ...extra,
});

test("the gate's comparison marks a finding the base already had, and not one the PR added", async () => {
  const gate = await gateModules(SCANNER);
  const kept = finding("src/a.mjs", "same as src/b.mjs:3");
  const added = finding("src/a.mjs", "same as src/c.mjs:9");
  const files = [{ path: "src/a.mjs", basePath: "src/old/a.mjs" }];
  const base = [finding("src/old/a.mjs", "same as src/b.mjs:7")];
  const classified = gate.classifyChanges({ files, head: [kept, added], base });
  assert.equal(markPreexisting([kept, added], classified), 1);
  assert.equal(kept.existing, true);
  assert.equal(added.existing, undefined);
});

test("a matched finding that got worse since the base stays unmarked", async () => {
  const gate = await gateModules(SCANNER);
  const medium = { rule: "function-length", severity: "medium" };
  const grown = finding("src/a.mjs", "run is 40 lines", { ...medium, symbol: "run", metric: 40 });
  const same = finding("src/a.mjs", "keep is 20 lines", { ...medium, symbol: "keep", metric: 20 });
  const baseGrown = finding("src/a.mjs", "run is 35 lines", { ...medium, symbol: "run", metric: 35 });
  const baseSame = finding("src/a.mjs", "keep is 20 lines", { ...medium, symbol: "keep", metric: 20 });
  const files = [{ path: "src/a.mjs", basePath: "src/a.mjs" }];
  const classified = gate.classifyChanges({ files, head: [grown, same], base: [baseGrown, baseSame] });
  assert.equal(markPreexisting([grown, same], classified), 1);
  assert.equal(grown.existing, undefined);
  assert.equal(same.existing, true);
});

test("an installed quality-guard without the gate modules stops with the file it lacks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-baseline-"));
  try {
    const scripts = join(dir, "skills", "quality-refactor", "scripts");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(join(scripts, "quality-scan.mjs"), "");
    await assert.rejects(gateModules(join(scripts, "quality-scan.mjs")), MISSING_GATE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a finding marked existing gets no S id and is counted per file and rule", () => {
  const changed = new Map([["src/a.mjs", new Set([10])]]);
  const scan = {
    violations: [
      finding("src/a.mjs", "one", { existing: true }),
      finding("src/a.mjs", "two", { existing: true }),
      finding("src/a.mjs", "three"),
    ],
  };
  const ids = scannerCandidates(scan, changed).map(({ id, message }) => [id, message]);
  assert.deepEqual(ids, [["S1", "three"]]);
  assert.deepEqual(unchangedAtBase(scan, changed), [{ file: "src/a.mjs", rule: "duplicate-block", count: 2 }]);
});

test("a high finding the base already had is info only; a new one still makes a thread", () => {
  const files = ["src/Old.cs", "src/New.cs"];
  const violations = [finding("src/Old.cs", "dup", { existing: true }), finding("src/New.cs", "dup")];
  const review = scannerReview({ files, line: 10, violations, rule: (ids) => ({ ids, status: "KEEP" }) });
  assert.deepEqual(review.counts, { BLOCKER: 0, MAJOR: 1, MINOR: 0 });
  assert.deepEqual(
    review.payload.comments.map(({ path }) => path),
    ["src/New.cs"],
  );
  assert.match(review.payload.body, INFO_SECTION);
  assert.doesNotMatch(review.payload.body, NO_MINOR_NOTES);
});

test("an old high finding beside a new medium one leaves the file MINOR", () => {
  const violations = [
    finding("src/Old.cs", "old dup", { existing: true }),
    finding("src/Old.cs", "new width", { rule: "line-length", severity: "medium" }),
  ];
  const review = scannerReview({
    files: ["src/Old.cs"],
    line: 10,
    violations,
    rule: (ids) => ({ ids, status: "KEEP" }),
  });
  assert.deepEqual(review.counts, { BLOCKER: 0, MAJOR: 0, MINOR: 1 });
  assert.equal(review.recommendation, "APPROVE");
  assert.match(review.payload.body, MINOR_LINE);
});
