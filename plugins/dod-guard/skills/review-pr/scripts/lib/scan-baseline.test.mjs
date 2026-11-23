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
import { scannerCandidates } from "./finding-ids.mjs";
import { gateModules, markPreexisting } from "./scan-baseline.mjs";
import { scannerReview } from "./scanner-review.test-support.mjs";
import { SHOWN } from "./scanner-summary.mjs";

// The repository's own quality-guard, laid out as the installed plugin is, so a
// rename of the gate modules fails this test instead of a live review.
const SCANNER = fileURLToPath(
  new URL("../../../../../../packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs", import.meta.url),
);
const EXISTING_NOTE = /### Minor notes[\s\S]*src\/Old\.cs:10[\s\S]*already in the code before this PR/;
const MISSING_GATE = /lacks pr-gate-compare\.mjs.*update quality-guard/;
const MIXED_NOTE = /1 of these 2 findings were already in the code before this PR; the ones it added end with/;
const NEW_TAGGED = /new width \(new in this PR\)/;
const OLD_TAGGED = /old dup \(new in this PR\)/;
const FRESH_TAGGED = /fresh high \(new in this PR\)/;
const OLD_ONE_TAGGED = /old 1 \(new in this PR\)/;

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

test("a candidate keeps the existing mark, and a finding without it stays unmarked", () => {
  const changed = new Map([["src/a.mjs", new Set([10])]]);
  const scan = { violations: [finding("src/a.mjs", "one", { existing: true }), finding("src/a.mjs", "two")] };
  const marks = scannerCandidates(scan, changed).map(({ message, existing }) => [message, existing]);
  assert.deepEqual(marks, [
    ["one", true],
    ["two", undefined],
  ]);
});

test("a high finding the base already had makes a minor note; a new one still makes a thread", () => {
  const files = ["src/Old.cs", "src/New.cs"];
  const violations = [finding("src/Old.cs", "dup", { existing: true }), finding("src/New.cs", "dup")];
  const review = scannerReview({ files, line: 10, violations, rule: (ids) => ({ ids, status: "KEEP" }) });
  assert.equal(review.counts.MAJOR, 1);
  assert.equal(review.counts.MINOR, 1);
  assert.deepEqual(
    review.payload.comments.map(({ path }) => path),
    ["src/New.cs"],
  );
  assert.match(review.payload.body, EXISTING_NOTE);
});

test("a group that mixes old and new findings tags the new ones and stays minor without a new high", () => {
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
  assert.equal(review.counts.MINOR, 1);
  assert.match(review.payload.body, MIXED_NOTE);
  assert.match(review.payload.body, NEW_TAGGED);
  assert.doesNotMatch(review.payload.body, OLD_TAGGED);
});

test("a new finding past the shown five keeps its tag in the full scanner list", () => {
  const old = Array.from({ length: SHOWN }, (_, index) =>
    finding("src/Old.cs", `old ${index + 1}`, { existing: true }),
  );
  const violations = [...old, finding("src/Old.cs", "fresh high")];
  const review = scannerReview({
    files: ["src/Old.cs"],
    line: 10,
    violations,
    rule: (ids) => ({ ids, status: "KEEP" }),
  });
  assert.equal(review.counts.MAJOR, 1);
  const lists = review.scannerComments.map(({ body }) => body).join("\n");
  assert.match(lists, FRESH_TAGGED);
  assert.doesNotMatch(lists, OLD_ONE_TAGGED);
});
