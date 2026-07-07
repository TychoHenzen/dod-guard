import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { analyseBrevity, analyseBrevityFromOutput, DEFAULT_BREVITY_OPTS } from "./brevity.js";

// ── Temp dir helpers ───────────────────────────────────────────────────

let tmpDir: string;
let _cleanup: (() => void) | null = null;

function setupTestDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brevity-test-"));
  process.chdir(tmpDir);

  try { execSync("git init", { cwd: tmpDir, stdio: "ignore" }); } catch { /* git not available */ }
  try { execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "ignore" }); } catch { /* */ }
  try { execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "ignore" }); } catch { /* */ }

  _cleanup = () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  };
}

after(() => _cleanup?.());

function writeFile(relPath: string, content: string) {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

describe("analyseBrevity", () => {
  before(setupTestDir);

  it("returns null when command has no source files", () => {
    const report = analyseBrevity("echo hello", tmpDir);
    assert.equal(report, null, "no source files in command → null");
  });

  it("detects long lines", () => {
    // Create a file with a very long line
    const longLine = "x".repeat(150);
    writeFile("src/long.ts", `export const x = "${longLine}";\n`);
    const report = analyseBrevity(`node src/long.ts`, tmpDir, { ...DEFAULT_BREVITY_OPTS, maxLineLength: 120 });
    assert.ok(report, "should find source files");
    assert.ok(report!.totalViolations > 0, "should have at least one violation");
    assert.ok(report!.violations.some((v) => v.kind === "line_too_long"), "should detect long line");
  });

  it("passes when everything is within limits", () => {
    // Short file, short lines, small function
    writeFile("src/clean.ts", [
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
    ].join("\n"));
    const report = analyseBrevity(`node src/clean.ts`, tmpDir);
    assert.ok(report, "should find source files");
    assert.equal(report!.totalViolations, 0, "clean file should have zero violations");
  });

  it("detects function too long", () => {
    const lines = ['export function bigOne(): void {'];
    for (let i = 0; i < 40; i++) lines.push(`  console.log("line ${i}");`);
    lines.push("}");
    writeFile("src/big.ts", lines.join("\n"));
    const report = analyseBrevity(`node src/big.ts`, tmpDir);
    assert.ok(report, "should find source files");
    assert.ok(report!.violations.some((v) => v.kind === "function_too_long"), "should detect long function");
  });

  it("detects file too long", () => {
    const lines: string[] = [];
    for (let i = 0; i < 350; i++) lines.push(`// line ${i}`);
    writeFile("src/huge.ts", lines.join("\n"));
    const report = analyseBrevity(`node src/huge.ts`, tmpDir, { ...DEFAULT_BREVITY_OPTS, maxFileLines: 300 });
    assert.ok(report, "should find source files");
    assert.ok(report!.violations.some((v) => v.kind === "file_too_long"), "should detect long file");
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
    const report = analyseBrevity(`node src/mixed.ts`, tmpDir);
    assert.ok(report, "should find source files");
    assert.ok(report!.violations.some((v) => v.kind === "mixed_cohesion"), "should detect mixed cohesion");
  });

  it("passes for function with only selection", () => {
    writeFile("src/select.ts", [
      'export function check(n: number): string {',
      '  if (n > 0) return "positive";',
      '  else if (n < 0) return "negative";',
      '  return "zero";',
      '}',
    ].join("\n"));
    const report = analyseBrevity(`node src/select.ts`, tmpDir);
    assert.ok(report, "should find source files");
    const mixed = report!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.equal(mixed.length, 0, "selection-only function should not be flagged");
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
    const report = analyseBrevity(`node src/iter.ts`, tmpDir);
    assert.ok(report, "should find source files");
    const mixed = report!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.equal(mixed.length, 0, "iteration-only function should not be flagged");
  });

  it("respects custom thresholds", () => {
    // File with 80-char lines, should pass with 100 threshold
    writeFile("src/custom.ts", [
      'export function shortOne(msg: string): void {',
      '  console.log(msg);',
      '}',
    ].join("\n"));
    const strict = analyseBrevity(`node src/custom.ts`, tmpDir, { ...DEFAULT_BREVITY_OPTS, maxFunctionLines: 2 });
    assert.ok(strict, "should find source files");
    assert.ok(strict!.violations.some((v) => v.kind === "function_too_long"), "3-line function should violate maxFunctionLines: 2");

    const loose = analyseBrevity(`node src/custom.ts`, tmpDir, { ...DEFAULT_BREVITY_OPTS, maxFunctionLines: 10 });
    assert.ok(loose);
    const longFn = loose!.violations.filter((v) => v.kind === "function_too_long");
    assert.equal(longFn.length, 0, "3-line function should pass with maxFunctionLines: 10");
  });

  it("can disable cohesion check", () => {
    writeFile("src/mixed2.ts", [
      'export function processItems(items: string[]): void {',
      '  if (items.length === 0) return;',
      '  for (const item of items) console.log(item);',
      '}',
    ].join("\n"));
    const withCohesion = analyseBrevity(`node src/mixed2.ts`, tmpDir, { ...DEFAULT_BREVITY_OPTS, requireCohesion: true });
    assert.ok(withCohesion!.violations.some((v) => v.kind === "mixed_cohesion"), "should flag with cohesion on");

    const withoutCohesion = analyseBrevity(`node src/mixed2.ts`, tmpDir, { ...DEFAULT_BREVITY_OPTS, requireCohesion: false });
    const mixed = withoutCohesion!.violations.filter((v) => v.kind === "mixed_cohesion");
    assert.equal(mixed.length, 0, "should not flag with cohesion off");
  });
});

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
    assert.equal(report!.totalViolations, 0, "clean file should have no violations");
  });

  it("parses git diff --numstat output", () => {
    writeFile("src/big.ts", [
      'export function longFunc(): void {',
      '  console.log("line 1");',
      '  console.log("line 2");',
      '}',
    ].join("\n"));
    // numstat format: insertions\ts\deletions\tfile
    const output = "15\t0\tsrc/big.ts\n";
    const report = analyseBrevityFromOutput(output, tmpDir, {
      ...DEFAULT_BREVITY_OPTS,
      minReplacementRatio: 0.2,
    });
    assert.ok(report, "should parse numstat output");
    const ratioViolations = report!.violations.filter((v) => v.kind === "low_replacement_ratio");
    assert.equal(ratioViolations.length, 1, "15 insertions + 0 deletions should trigger low replacement ratio");
  });

  it("detects low replacement ratio", () => {
    writeFile("src/changed.ts", [
      'export function original(): string {',
      '  return "original";',
      '}',
      'export function newFn(): string {',
      '  return "new stuff on top of old";',
      '}',
      'export function anotherNew(): number {',
      '  return 42;',
      '}',
      'export function yetAnother(): boolean {',
      '  return true;',
      '}',
    ].join("\n"));
    // 12 insertions, 0 deletions — ratio 0 < 0.2 with 11+ insertions → low_replacement_ratio
    const output = "12\t0\tsrc/changed.ts\n";
    const report = analyseBrevityFromOutput(output, tmpDir, {
      ...DEFAULT_BREVITY_OPTS,
      minReplacementRatio: 0.2,
    });
    assert.ok(report, "should parse numstat");
    const ratioViolations = report!.violations.filter((v) => v.kind === "low_replacement_ratio");
    assert.equal(ratioViolations.length, 1, "12 insertions + 0 deletions → low replacement ratio violation");
  });

  it("skips replacement ratio for < 10 insertions", () => {
    writeFile("src/tiny.ts", 'export const x = 1;\n');
    const output = "3\t0\tsrc/tiny.ts\n";
    const report = analyseBrevityFromOutput(output, tmpDir, {
      ...DEFAULT_BREVITY_OPTS,
      minReplacementRatio: 0.2,
    });
    assert.ok(report);
    const ratioViolations = report!.violations.filter((v) => v.kind === "low_replacement_ratio");
    assert.equal(ratioViolations.length, 0, "should not flag small changes with < 10 insertions");
  });

  it("returns null for output with no source files", () => {
    const report = analyseBrevityFromOutput("just some random output\nno files here\n", tmpDir);
    assert.equal(report, null, "output with no file paths → null");
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
    assert.ok(report!.violations.some((v) => v.kind === "mixed_cohesion"), "Python mixed cohesion should be detected");
  });
});

describe("brevity edge cases", () => {
  before(setupTestDir);

  it("handles empty files gracefully", () => {
    writeFile("src/empty.ts", "");
    const report = analyseBrevity(`node src/empty.ts`, tmpDir);
    assert.ok(report, "should handle empty files");
    assert.equal(report!.totalViolations, 0, "empty file has no violations");
  });

  it("skips non-source files", () => {
    writeFile("src/config.json", '{"key": "value"}');
    const report = analyseBrevity(`node src/config.json`, tmpDir);
    assert.equal(report, null, "non-source files should be skipped");
  });

  it("skips files in build output dirs", () => {
    writeFile("dist/generated.ts", "x".repeat(200));
    const report = analyseBrevity(`node dist/generated.ts`, tmpDir);
    assert.equal(report, null, "dist files should be skipped");
  });

  it("handles files with only comments", () => {
    writeFile("src/comments.ts", [
      "// This is a comment-only file",
      "// No actual code here",
      "/*",
      " * Multi-line comment",
      " */",
    ].join("\n"));
    const report = analyseBrevity(`node src/comments.ts`, tmpDir);
    assert.ok(report, "should handle comment-only files");
    // No functions detected → zero function-level violations
    const fnViolations = report!.violations.filter((v) => v.kind === "function_too_long" || v.kind === "mixed_cohesion");
    assert.equal(fnViolations.length, 0, "comment-only file has no functions");
  });
});
