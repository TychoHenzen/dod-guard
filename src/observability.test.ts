import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { analyseObservability, analyseObservabilityFromOutput } from "./observability.js";

// ── Test fixtures ────────────────────────────────────────────────────────

let TMP: string;

test.beforeEach(() => {
  TMP = path.resolve(os.tmpdir(), `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
});

function setup(...files: Array<{ name: string; content: string }>) {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  for (const f of files) {
    const filePath = path.join(TMP, f.name);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, f.content, "utf-8");
  }
}

function cleanup() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
}

test.afterEach(cleanup);

// ── Language detection ────────────────────────────────────────────────────

test("detects JS/TS files by extension", () => {
  setup({ name: "foo.ts", content: "console.log('hi');" });
  const report = analyseObservability("node foo.ts", TMP);
  assert.ok(report, "should detect the source file");
  assert.equal(report!.files.length, 1, "should report exactly one file");
  assert.ok(report!.files[0].endsWith("foo.ts"), "report should reference foo.ts");
});

test("detects Python files by extension", () => {
  setup({ name: "foo.py", content: "logger.info('hi')" });
  const report = analyseObservability("python foo.py", TMP);
  assert.ok(report, "should return a report for Python");
  assert.equal(report!.files.length, 1, "should report exactly one file");
  assert.ok(report!.files[0].endsWith("foo.py"), "report should reference foo.py");
});

test("detects Rust files by extension", () => {
  setup({ name: "foo.rs", content: 'error!("oops");' });
  const report = analyseObservability("cargo test foo.rs", TMP);
  assert.ok(report, "should return a report for Rust");
  assert.equal(report!.files.length, 1, "should report exactly one file");
});

test("ignores non-source files", () => {
  setup(
    { name: "foo.md", content: "## Title" },
    { name: "foo.json", content: "{}" },
  );
  const report = analyseObservability("node foo.md foo.json", TMP);
  assert.equal(report, null, "non-source files should not be scanned");
});

// ── Extension edge cases ─────────────────────────────────────────────────

test("detects uppercase extension files (.TS)", () => {
  setup({ name: "app.TS", content: "console.log('hi');" });
  const report = analyseObservability("node app.TS", TMP);
  assert.ok(report, "should detect uppercase .TS files");
  assert.equal(report!.files.length, 1, "should find exactly one file");
  assert.ok(report!.files[0].endsWith("app.TS"), "report should reference the uppercase file");
});

test("detects multi-dot files (app.util.ts)", () => {
  setup({ name: "app.util.ts", content: "console.log('util');" });
  const report = analyseObservability("node app.util.ts", TMP);
  assert.ok(report, "should detect multi-dot files");
  assert.ok(report!.files[0].endsWith("app.util.ts"), "should find the multi-dot file");
});

test("ignores extensionless source files", () => {
  setup({ name: "Makefile", content: "all: clean build" });
  const report = analyseObservability("make Makefile", TMP);
  assert.equal(report, null, "extensionless files should not be scanned");
});

// ── Log statement counting ────────────────────────────────────────────────

test("counts JS console.* statements", () => {
  setup({
    name: "app.ts",
    content: [
      'console.log("starting");',
      "console.error(err);",
      'console.warn("deprecated");',
      'logger.info("auth ok", { userId });',
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report counting JS console.* statements");
  assert.equal(report!.totalLogStatements, 4, "should count 4 log statements");
});

test("counts Python logging statements", () => {
  setup({
    name: "app.py",
    content: [
      'logging.info("starting up")',
      'logger.error(f"failed: {e}")',
      'self.logger.warning("deprecated path")',
    ].join("\n"),
  });
  const report = analyseObservability("python app.py", TMP);
  assert.ok(report, "should return a report counting Python logging");
  assert.equal(report!.totalLogStatements, 3, "should count 3 Python log statements");
});

test("counts Rust macro log statements", () => {
  setup({
    name: "lib.rs",
    content: [
      'error!("something broke");',
      'warn!("approaching limit: {}", current);',
      'info!("status ok");',
      'dbg!(&state);',
      'tracing::info!("request processed");',
    ].join("\n"),
  });
  const report = analyseObservability("cargo build lib.rs", TMP);
  assert.ok(report, "should return a report counting Rust macros");
  assert.equal(report!.totalLogStatements, 5, "should count 5 Rust log statements");
});

test("counts C# log statements", () => {
  setup({
    name: "Service.cs",
    content: [
      '_logger.LogInformation("Processing {Id}", id);',
      'Log.Error("failed");',
      'Console.WriteLine("done");',
    ].join("\n"),
  });
  const report = analyseObservability("dotnet build Service.cs", TMP);
  assert.ok(report, "should return a report counting C# logs");
  assert.equal(report!.totalLogStatements, 3, "should count 3 C# log statements");
});

// ── Error handler detection ───────────────────────────────────────────────

test("detects JS catch blocks with logging", () => {
  setup({
    name: "app.ts",
    content: [
      "try {",
      "  doThing();",
      "} catch (e) {",
      '  console.error("failed", e);',
      "  throw e;",
      "}",
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for JS error handlers");
  assert.equal(report!.totalErrorHandlers, 1, "should detect 1 error handler");
  assert.equal(report!.errorHandlersLogged, 1, "should count 1 logged handler");
});

test("detects JS catch blocks WITHOUT logging", () => {
  setup({
    name: "app.ts",
    content: [
      "try { doThing(); }",
      "catch (e) {",
      "  return null;",
      "}",
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for JS catch without logging");
  assert.equal(report!.totalErrorHandlers, 1, "should detect 1 error handler");
  assert.equal(report!.errorHandlersLogged, 0, "catch block without logging should not count as logged");
});

test("detects Python except blocks", () => {
  setup({
    name: "app.py",
    content: [
      "try:",
      "    do_thing()",
      "except ValueError as e:",
      '    logger.error("bad value: %s", e)',
      "    raise",
    ].join("\n"),
  });
  const report = analyseObservability("python app.py", TMP);
  assert.ok(report, "should return a report for Python except blocks");
  assert.equal(report!.totalErrorHandlers, 1, "should detect 1 error handler");
  assert.equal(report!.errorHandlersLogged, 1, "should count 1 logged handler");
});

test("detects Rust error handlers", () => {
  setup({
    name: "lib.rs",
    content: [
      "match result {",
      "    Ok(v) => v,",
      '    Err(e) => {',
      '        error!("failed: {}", e);',
      "        return default;",
      "    }",
      "}",
    ].join("\n"),
  });
  const report = analyseObservability("cargo build lib.rs", TMP);
  assert.ok(report, "should return a report for Rust error handlers");
  assert.equal(report!.totalErrorHandlers, 2, "should detect two error handler constructs");
  assert.equal(report!.errorHandlersLogged, 2, "both error handler constructs should count as logged");
});

// ── Anti-pattern detection ────────────────────────────────────────────────

test("flags empty catch blocks (JS)", () => {
  setup({
    name: "app.ts",
    content: [
      'console.log("start");',
      "try { doThing(); } catch (e) { }",
      "try { doOther(); } catch { }",
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for empty catch blocks");
  const emptyCatches = report!.antiPatterns.filter((a) => a.kind === "empty_catch");
  assert.equal(emptyCatches.length, 2, "both empty catch blocks should be flagged");
});

test("flags empty except blocks (Python)", () => {
  setup({
    name: "app.py",
    content: [
      "try:",
      "    do_thing()",
      "except ValueError:",
      "    pass",
      "",
      "try:",
      "    do_other()",
      "except Exception:",
      "    pass  # ignored",
    ].join("\n"),
  });
  const report = analyseObservability("python app.py", TMP);
  assert.ok(report, "should return a report for Python empty except");
  const emptyCatches = report!.antiPatterns.filter((a) => a.kind === "empty_catch");
  assert.equal(emptyCatches.length, 2, "both except:pass blocks should be flagged");
});

test("flags empty Err blocks (Rust)", () => {
  setup({
    name: "lib.rs",
    content: [
      'error!("starting");',
      "let x = match r {",
      '    Err(_) => { },',
      "    Ok(v) => v,",
      "};",
    ].join("\n"),
  });
  const report = analyseObservability("cargo build lib.rs", TMP);
  assert.ok(report, "should return a report for Rust empty Err");
  const emptyCatches = report!.antiPatterns.filter((a) => a.kind === "empty_catch");
  assert.equal(emptyCatches.length, 1, "empty Err block should be flagged");
});

test("flags bare static log messages (JS)", () => {
  setup({
    name: "app.ts",
    content: [
      'console.error("failed");',
      'console.warn("something happened");',
      'console.error("failed", err);', // NOT bare — has variable
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for bare log detection");
  const bare = report!.antiPatterns.filter((a) => a.kind === "bare_log");
  assert.equal(bare.length, 2, "static string logs should be flagged as bare");
  assert.equal(report!.totalLogStatements, 3, "should count 3 log statements total");
});

test("does NOT flag template literals as bare logs (JS)", () => {
  setup({
    name: "app.ts",
    content: [
      "const msg = `user ${id} failed: ${err.message}`;",
      "console.error(msg);",
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for template literals");
  const bare = report!.antiPatterns.filter((a) => a.kind === "bare_log");
  // console.error(msg) — the arg is a variable, not a string literal
  assert.equal(bare.length, 0, "template literals should pass");
});

test("flags bare static log messages (Python)", () => {
  setup({
    name: "app.py",
    content: [
      'logging.error("failed")',
      'logger.warning("deprecated", extra={"user": uid})', // NOT bare — has extra
      'self.logger.info("ok")',
    ].join("\n"),
  });
  const report = analyseObservability("python app.py", TMP);
  assert.ok(report, "should return a report for Python bare logs");
  const bare = report!.antiPatterns.filter((a) => a.kind === "bare_log");
  assert.equal(bare.length, 2, '"failed" and "ok" should be flagged as bare');
});

test("flags bare static log messages (Rust)", () => {
  setup({
    name: "lib.rs",
    content: [
      'error!("failed");',
      'info!("user {} logged in", name);', // NOT bare — has format arg
    ].join("\n"),
  });
  const report = analyseObservability("cargo build lib.rs", TMP);
  assert.ok(report, "should return a report for Rust bare logs");
  const bare = report!.antiPatterns.filter((a) => a.kind === "bare_log");
  assert.equal(bare.length, 1, "bare Rust macro should be flagged");
  assert.equal(bare[0].line, 1, "bare log should be on line 1");
});

test("flags swallowed errors (JS return-without-log)", () => {
  setup({
    name: "app.ts",
    content: [
      "try {",
      "  fetchUser();",
      "} catch (e) {",
      "  return null;",
      "}",
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for swallowed errors");
  const swallowed = report!.antiPatterns.filter((a) => a.kind === "swallowed_error");
  assert.equal(swallowed.length, 1, "catch-return without log should be swallowed error");
});

// ── File extraction from command ──────────────────────────────────────────

test("returns null when referenced source file does not exist", () => {
  setup({ name: "app.ts", content: "console.log('hi');" });
  const report = analyseObservability("npx jest app.test.ts --coverage", TMP);
  assert.equal(report, null, "non-existent file should return null");
});

test("extracts files from git diff output", () => {
  setup(
    { name: "src/app.ts", content: "console.log('hello');" },
    { name: "src/util.ts", content: "console.error('oops', e);" },
  );
  const output = "src/app.ts\nsrc/util.ts\nREADME.md\n";
  const report = analyseObservabilityFromOutput(output, TMP);
  assert.ok(report, "should return a report from git diff output");
  assert.equal(report!.files.length, 2, "should find both source files, skip README");
});

test("returns null when no source files found from command", () => {
  setup({ name: "foo.md", content: "## Title" });
  const report = analyseObservability("echo hello", TMP);
  assert.equal(report, null, "should return null when no source files found");
});

test("returns null when no source files found from output", () => {
  const report = analyseObservabilityFromOutput("All tests passed\n3 passed\n", TMP);
  assert.equal(report, null, "should return null when no source files in output");
});

// ── Composite pass/fail conditions ────────────────────────────────────────

test("PASSES when all conditions met", () => {
  setup({
    name: "app.ts",
    content: [
      'console.log("app starting", { port });',
      'logger.info("request received", { method, path });',
      "",
      "try {",
      "  processData(input);",
      "} catch (e) {",
      '  logger.error("processData failed", { error: e.message, input });',
      "  throw new ProcessingError('failed', { cause: e });",
      "}",
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for composite pass test");
  assert.equal(report!.totalLogStatements, 3, "should have 3 log statements");
  assert.equal(report!.errorHandlersLogged, 1, "the one error handler should be logged");
  assert.equal(report!.totalErrorHandlers, 1, "should detect exactly one error handler");
  assert.equal(report!.antiPatterns.length, 0, "no anti-patterns");
});

test("FAILS with multiple anti-pattern types in one report", () => {
  setup({
    name: "bad.ts",
    content: [
      'console.log("start");', // bare log
      "",
      "try {",
      "  fetch();",
      "} catch (e) { }", // empty catch
      "",
      "try {",
      "  parse();",
      "} catch (e) {",
      "  return null;", // swallowed error
      "}",
    ].join("\n"),
  });
  const report = analyseObservability("tsc bad.ts", TMP);
  assert.ok(report, "should return a report for multiple anti-patterns");
  const kinds = report!.antiPatterns.map((a) => a.kind);
  assert.ok(kinds.includes("empty_catch"), `should include "empty_catch" -- actual kinds: [${kinds.join(", ")}]`);
  assert.ok(kinds.includes("swallowed_error"), `should include "swallowed_error" -- actual kinds: [${kinds.join(", ")}]`);
  assert.ok(kinds.includes("bare_log"), `should include "bare_log" -- actual kinds: [${kinds.join(", ")}]`);
});

// ── Per-file breakdown ────────────────────────────────────────────────────

test("provides per-file breakdown in report", () => {
  setup(
    {
      name: "src/good.ts",
      content: [
        'console.log("start");',
        'logger.error("err", e);',
      ].join("\n"),
    },
    {
      name: "src/bad.ts",
      content: [
        "try { do(); } catch(e) { }",
      ].join("\n"),
    },
  );
  const report = analyseObservability("tsc src/good.ts src/bad.ts", TMP);
  assert.ok(report, "should return a report for per-file breakdown");
  assert.equal(report!.perFile.length, 2, "should have entries for both files");
  const good = report!.perFile.find((f) => f.file.includes("good"));
  const bad = report!.perFile.find((f) => f.file.includes("bad"));
  assert.ok(good, "should have good.ts entry");
  assert.ok(bad, "should have bad.ts entry");
  assert.equal(good!.logCount, 2, "good.ts should have exactly 2 log statements");
  assert.equal(bad!.antiPatterns.length, 1, "bad.ts should have exactly 1 anti-pattern");
});

// ── Python f-string not flagged as bare ───────────────────────────────────

test("does NOT flag Python f-strings as bare logs", () => {
  setup({
    name: "app.py",
    content: [
      'logger.error(f"user {uid} failed")',
      'logging.info(f"processing {count} items")',
    ].join("\n"),
  });
  const report = analyseObservability("python app.py", TMP);
  assert.ok(report, "should return a report for Python f-strings");
  const bare = report!.antiPatterns.filter((a) => a.kind === "bare_log");
  assert.equal(bare.length, 0, "f-strings should not be bare");
});

// ── JS multi-arg log not flagged as bare ──────────────────────────────────

test("does NOT flag multi-arg JS log as bare", () => {
  setup({
    name: "app.ts",
    content: [
      'console.error("failed", err);',
      'logger.info("user login", { userId, timestamp });',
    ].join("\n"),
  });
  const report = analyseObservability("tsc app.ts", TMP);
  assert.ok(report, "should return a report for JS multi-arg logs");
  const bare = report!.antiPatterns.filter((a) => a.kind === "bare_log");
  assert.equal(bare.length, 0, "multi-arg logs should not be bare");
});

// ── Boundary cases ────────────────────────────────────────────────────────

test("handles empty source files", () => {
  setup({ name: "empty.ts", content: "" });
  const report = analyseObservability("tsc empty.ts", TMP);
  assert.ok(report, "should return a report for empty files");
  assert.equal(report!.totalLogStatements, 0, "empty file should have 0 log statements");
  assert.equal(report!.totalErrorHandlers, 0, "empty file should have 0 error handlers");
  assert.equal(report!.antiPatterns.length, 0, "empty file should have 0 anti-patterns");
});

test("handles whitespace-only source files", () => {
  setup({ name: "whitespace.ts", content: "\n  \n\t\n" });
  const report = analyseObservability("tsc whitespace.ts", TMP);
  assert.ok(report, "should return a report for whitespace-only files");
  assert.equal(report!.totalLogStatements, 0, "whitespace-only file should have 0 log statements");
  assert.equal(report!.totalErrorHandlers, 0, "whitespace-only file should have 0 error handlers");
});

test("handles missing source file gracefully", () => {
  const report = analyseObservability("tsc nonexistent.ts", TMP);
  assert.equal(report, null, "missing file should produce null report");
});

// ── Deep nesting & mixed environments ────────────────────────────────────

test("scans deeply nested source files", () => {
  const nestedPath = path.join("src", "lib", "util", "helpers", "strings.ts");
  setup({ name: nestedPath, content: 'console.log("nested");' });
  const report = analyseObservability(`tsc ${nestedPath}`, TMP);
  assert.ok(report, "should scan deeply nested files");
  assert.equal(report!.files.length, 1, "should find the deeply nested file");
  assert.equal(report!.totalLogStatements, 1, "should count the nested file's log");
});

test("handles mixed-language projects in single scan", () => {
  setup(
    { name: "src/app.ts", content: 'console.log("ts");' },
    { name: "src/util.py", content: 'logger.info("py")' },
    { name: "src/lib.rs", content: 'error!("rs");' },
  );
  const report = analyseObservability("make build src/app.ts src/util.py src/lib.rs", TMP);
  assert.ok(report, "should handle mixed-language projects");
  assert.equal(report!.files.length, 3, "should find all three source files");
  assert.equal(report!.totalLogStatements, 3, "should count one log per language");
});

test("handles Windows backslash path separators in command", () => {
  setup({ name: "src\\app.ts", content: 'console.log("win");' });
  const report = analyseObservability("tsc src\\app.ts", TMP);
  assert.ok(report, "should handle backslash paths");
  assert.equal(report!.files.length, 1, "should find the win-path file");
});

test("handles Windows backslash paths from output", () => {
  setup({ name: "src\\lib\\util.ts", content: 'console.error("err");' });
  const output = "src\\lib\\util.ts\npackage.json\n";
  const report = analyseObservabilityFromOutput(output, TMP);
  assert.ok(report, "should handle backslash paths from output");
  assert.equal(report!.files.length, 1, "should find file with backslash path");
});
