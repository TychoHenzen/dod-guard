import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { analyseBrevity, analyseBrevityFromOutput, DEFAULT_BREVITY_OPTS } from "./brevity.js";

// ── Temp dir helpers ───────────────────────────────────────────────────

let tmpDir: string;
const _cleanupFns: (() => void)[] = [];

function setupTestDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brevity-test-"));
  try { execSync("git init", { cwd: tmpDir, stdio: "ignore" }); } catch { /* git not available */ }
  try { execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "ignore" }); } catch { /* */ }
  try { execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "ignore" }); } catch { /* */ }
  _cleanupFns.push(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  });
}

after(() => { for (const fn of _cleanupFns) fn(); });

function writeFile(relPath: string, content: string) {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

// ── analyseBrevity ─────────────────────────────────────────────────────

describe("analyseBrevity", () => {
  before(setupTestDir);

  it("returns null when command has no source files", () => {
    const report = analyseBrevity("echo hello", tmpDir);
    assert.equal(report, null, "non-source command should return null");
  });

  it("detects long lines", () => {
    const longLine = "x".repeat(150);
    writeFile("src/long.ts", `export const x = "${longLine}";\n`);
    const report = analyseBrevity("node src/long.ts", tmpDir, { ...DEFAULT_BREVITY_OPTS, maxLineLength: 120 });
    assert.ok(report, "report should not be null when source files found");
    assert.ok(report!.totalViolations > 0,
      `expected violations > 0, got ${report!.totalViolations}`);
    const longLines = report!.violations.filter((v) => v.kind === "line_too_long");
    assert.ok(longLines.length >= 1,
      `expected at least 1 line_too_long violation, got ${longLines.length}`);
  });

  it("passes when everything is within limits", () => {
    writeFile("src/clean.ts", [
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
    ].join("\n"));
    const report = analyseBrevity("node src/clean.ts", tmpDir);
    assert.ok(report, "report should not be null");
    assert.equal(report!.totalViolations, 0, "clean file has zero violations");
    assert.deepEqual(report!.violations, [], "violations array should be empty");
  });

  it("detects function too long", () => {
    const lines = ['export function bigOne(): void {'];
    for (let i = 0; i < 40; i++) lines.push(`  console.log("line ${i}");`);
    lines.push("}");
    writeFile("src/big.ts", lines.join("\n"));
    const report = analyseBrevity("node src/big.ts", tmpDir);
    assert.ok(report, "report should not be null");
    const longFns = report!.violations.filter((v) => v.kind === "function_too_long");
    assert.ok(longFns.length >= 1,
      `expected at least 1 function_too_long violation, got ${longFns.length}`);
  });

  it("detects file too long", () => {
    const lines: string[] = [];
    for (let i = 0; i < 350; i++) lines.push(`// line ${i}`);
    writeFile("src/huge.ts", lines.join("\n"));
    const report = analyseBrevity("node src/huge.ts", tmpDir, { ...DEFAULT_BREVITY_OPTS, maxFileLines: 300 });
    assert.ok(report, "report should not be null");
    const fileLong = report!.violations.filter((v) => v.kind === "file_too_long");
    assert.ok(fileLong.length >= 1,
      `expected at least 1 file_too_long violation, got ${fileLong.length}`);
  });

  it("detects mixed cohesion (selection + iteration)", () => {
    writeFile("src/mixed.ts", [
      'export function processItems(items: string[]): void {',
      '  if (items.length === 0) {',
      '    console.log("empty");',
      '    return;',
      '  }',
      '  for (const item of items) {',
      '    console.log(item);',
      '  }',
      '}',
    ].join("\n"));
    const report = analyseBrevity("node src/mixed.ts", tmpDir);
    assert.ok(report, "report should not be null");
    const mixed = report!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.ok(mixed.length >= 1,
      `expected at least 1 mixed_cohesion violation, got ${mixed.length}`);
  });

  it("passes for function with only selection", () => {
    writeFile("src/select.ts", [
      'export function check(n: number): string {',
      '  if (n > 0) return "positive";',
      '  else if (n < 0) return "negative";',
      '  return "zero";',
      '}',
    ].join("\n"));
    const report = analyseBrevity("node src/select.ts", tmpDir);
    assert.ok(report, "report should not be null");
    const mixed = report!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.equal(mixed.length, 0,
      `selection-only function should not be flagged, got ${mixed.length} mixed_cohesion violations`);
  });

  it("passes for function with only iteration", () => {
    writeFile("src/iter.ts", [
      'export function sumAll(nums: number[]): number {',
      '  let total = 0;',
      '  for (const n of nums) {',
      '    total += n;',
      '  }',
      '  while (total > 1000) {',
      '    total -= 1000;',
      '  }',
      '  return total;',
      '}',
    ].join("\n"));
    const report = analyseBrevity("node src/iter.ts", tmpDir);
    assert.ok(report, "report should not be null");
    const mixed = report!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.equal(mixed.length, 0,
      `iteration-only function should not be flagged, got ${mixed.length} mixed_cohesion violations`);
  });

  it("respects custom thresholds", () => {
    writeFile("src/custom.ts", [
      'export function shortOne(msg: string): void {',
      '  console.log(msg);',
      '}',
    ].join("\n"));
    const strict = analyseBrevity("node src/custom.ts", tmpDir, { ...DEFAULT_BREVITY_OPTS, maxFunctionLines: 2 });
    assert.ok(strict, "strict report should not be null");
    const strictV = strict!.violations.filter((v) => v.kind === "function_too_long");
    assert.ok(strictV.length >= 1,
      "3-line function violates maxFunctionLines:2 threshold");

    const loose = analyseBrevity("node src/custom.ts", tmpDir, { ...DEFAULT_BREVITY_OPTS, maxFunctionLines: 10 });
    assert.ok(loose, "loose report should not be null");
    const looseV = loose!.violations.filter((v) => v.kind === "function_too_long");
    assert.equal(looseV.length, 0,
      "3-line function passes maxFunctionLines:10 threshold");
  });

  it("can disable cohesion check", () => {
    writeFile("src/mixed2.ts", [
      'export function processItems(items: string[]): void {',
      '  if (items.length === 0) return;',
      '  for (const item of items) console.log(item);',
      '}',
    ].join("\n"));
    const withCohesion = analyseBrevity("node src/mixed2.ts", tmpDir, { ...DEFAULT_BREVITY_OPTS, requireCohesion: true });
    assert.ok(withCohesion, "cohesion-on report should not be null");
    assert.ok(withCohesion!.violations.some((v) => v.kind === "mixed_cohesion"),
      "requireCohesion:true should flag mixed cohesion");

    const withoutCohesion = analyseBrevity("node src/mixed2.ts", tmpDir, { ...DEFAULT_BREVITY_OPTS, requireCohesion: false });
    assert.ok(withoutCohesion, "cohesion-off report should not be null");
    const mixed = withoutCohesion!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.equal(mixed.length, 0,
      "requireCohesion:false should not flag mixed cohesion");
  });
});

// ── analyseBrevityFromOutput ───────────────────────────────────────────

describe("analyseBrevityFromOutput", () => {
  before(setupTestDir);

  it("parses git diff --name-only output", () => {
    writeFile("src/clean.ts", [
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
    ].join("\n"));
    const output = "src/clean.ts\n";
    const report = analyseBrevityFromOutput(output, tmpDir);
    assert.ok(report, "should parse file names from output");
    assert.equal(report!.totalViolations, 0,
      "clean file should have no violations");
  });

  it("parses git diff --numstat output", () => {
    writeFile("src/big.ts", [
      'export function longFunc(): void {',
      '  console.log("line 1");',
      '  console.log("line 2");',
      '}',
    ].join("\n"));
    const output = "15\t0\tsrc/big.ts\n";
    const report = analyseBrevityFromOutput(output, tmpDir, {
      ...DEFAULT_BREVITY_OPTS,
      minReplacementRatio: 0.2,
    });
    assert.ok(report, "should parse numstat output");
    const ratioV = report!.violations.filter((v) => v.kind === "low_replacement_ratio");
    assert.equal(ratioV.length, 1,
      "15 insertions 0 deletions should trigger low replacement ratio");
  });

  it("detects low replacement ratio", () => {
    writeFile("src/changed.ts", [
      'export function original(): string {',
      '  return "original";',
      '}',
      'export function newFn(): string {',
      '  return "new";',
      '}',
      'export function anotherNew(): number {',
      '  return 42;',
      '}',
      'export function yetAnother(): boolean {',
      '  return true;',
      '}',
    ].join("\n"));
    const output = "12\t0\tsrc/changed.ts\n";
    const report = analyseBrevityFromOutput(output, tmpDir, {
      ...DEFAULT_BREVITY_OPTS,
      minReplacementRatio: 0.2,
    });
    assert.ok(report, "should parse numstat");
    const ratioV = report!.violations.filter((v) => v.kind === "low_replacement_ratio");
    assert.equal(ratioV.length, 1,
      "12 insertions 0 deletions → low replacement ratio");
  });

  it("skips replacement ratio for net ≤10 insertions", () => {
    writeFile("src/tiny.ts", 'export const x = 1;\n');
    const output = "3\t0\tsrc/tiny.ts\n";
    const report = analyseBrevityFromOutput(output, tmpDir, {
      ...DEFAULT_BREVITY_OPTS,
      minReplacementRatio: 0.2,
    });
    assert.ok(report, "should return report");
    const ratioV = report!.violations.filter((v) => v.kind === "low_replacement_ratio");
    assert.equal(ratioV.length, 0,
      "≤10 insertions should not trigger low_replacement_ratio");
  });

  it("returns null for output with no source files", () => {
    const report = analyseBrevityFromOutput("just some random output\nno files here\n", tmpDir);
    assert.equal(report, null,
      "output with no file paths should return null");
  });

  it("handles Python function detection", () => {
    writeFile("src/thing.py", [
      "def process_data(items):",
      "    total = 0",
      "    if items is None:",
      "        return 0",
      "    for item in items:",
      "        total += item",
      "    return total",
    ].join("\n"));
    const output = "src/thing.py\n";
    const report = analyseBrevityFromOutput(output, tmpDir);
    assert.ok(report, "should parse Python file");
    const mixed = report!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.ok(mixed.length >= 1,
      "Python function with if+for should be flagged as mixed cohesion");
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────

describe("brevity edge cases", () => {
  before(setupTestDir);

  it("handles empty files gracefully", () => {
    writeFile("src/empty.ts", "");
    const report = analyseBrevity("node src/empty.ts", tmpDir);
    assert.ok(report, "empty file should not return null");
    assert.equal(report!.totalViolations, 0,
      "empty file should have zero violations");
  });

  it("skips non-source files", () => {
    writeFile("src/config.json", '{"key": "value"}');
    const report = analyseBrevity("node src/config.json", tmpDir);
    assert.equal(report, null,
      "non-source extensions should return null");
  });

  it("skips files in build output dirs", () => {
    writeFile("dist/generated.ts", "x".repeat(200));
    const report = analyseBrevity("node dist/generated.ts", tmpDir);
    assert.equal(report, null, "dist dir files should be skipped");
  });

  it("handles files with only comments", () => {
    writeFile("src/comments.ts", [
      "// This is a comment-only file",
      "// No actual code here",
      "/*",
      " * Multi-line comment",
      " */",
    ].join("\n"));
    const report = analyseBrevity("node src/comments.ts", tmpDir);
    assert.ok(report, "comment-only file should not return null");
    const fnV = report!.violations.filter(
      (v) => v.kind === "function_too_long" || v.kind === "mixed_cohesion",
    );
    assert.equal(fnV.length, 0,
      "comment-only file should have zero function violations");
  });

  // ── Error-path tests ────────────────────────────────────────────────

  it("returns null for nonexistent directory", () => {
    const report = analyseBrevity("node src/nope.ts", path.join(tmpDir, "nonexistent"));
    assert.equal(report, null,
      "nonexistent directory should safely return null");
  });

  it("handles binary files without crashing", () => {
    const full = path.join(tmpDir, "src", "binary.ts");
    fs.mkdirSync(path.dirname(full), { recursive: true });
    // Write bytes that look like binary (null bytes)
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00]);
    fs.writeFileSync(full, buf);
    const report = analyseBrevity("node src/binary.ts", tmpDir);
    // Should not throw — binary content is handled gracefully
    assert.ok(report !== undefined, "binary files should not crash analyser");
  });
});
