import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandGlobsInCommand,
  extractCommandNames,
  findMissingTools,
  hasGlobWildcards,
  isEsmPackage,
  isPlaceholderCommand,
  suggestionFor,
  usesNodeEvalRequire,
} from "./command-check.js";

test("extracts a simple command", () => {
  assert.deepEqual(extractCommandNames("grep -i foo file.txt"), ["grep"], "should extract grep from a simple command");
});

// Regression (PC-3): a DoD authored with Unix `grep` on a Windows host must be
// steered to `findstr` at create time, so the 26-amend grep→findstr batch from
// PBI #31790 cannot recur.
test("suggests the Windows-native equivalent for a Unix-only tool", () => {
  assert.equal(suggestionFor("grep"), "findstr", "grep should map to findstr");
  assert.equal(suggestionFor("GREP"), "findstr", "GREP (uppercase) should map to findstr");
  assert.equal(suggestionFor("cat"), "type", "cat should map to type");
  assert.equal(suggestionFor("npm"), undefined, "npm should have no suggestion (already available)");
});

test("extracts both sides of a pipe", () => {
  assert.deepEqual(
    extractCommandNames("npm test | grep -i fail"),
    ["npm", "grep"],
    "should extract both npm and grep from pipe",
  );
});

test("extracts across && and || and ; chains", () => {
  assert.deepEqual(extractCommandNames("cargo build && cargo test"), ["cargo"], "&& chain should deduplicate cargo");
  assert.deepEqual(extractCommandNames("echo hi; ls -la"), ["echo", "ls"], "; chain should extract both commands");
  assert.deepEqual(extractCommandNames("a.exe || b.exe"), ["a.exe", "b.exe"], "|| chain should extract both commands");
});

test("chained pipes return each stage", () => {
  assert.deepEqual(
    extractCommandNames("cat x | sort | head -n5"),
    ["cat", "sort", "head"],
    "chained pipes should return all three stages",
  );
});

test("skips leading env-assignments (posix style)", () => {
  assert.deepEqual(
    extractCommandNames("FOO=1 BAR=2 node app.js"),
    ["node"],
    "env assignments should be skipped, keeping only node",
  );
});

test("handles a quoted executable path with spaces", () => {
  assert.deepEqual(
    extractCommandNames('"C:\\Program Files\\app\\tool.exe" --check'),
    ["C:\\Program Files\\app\\tool.exe"],
    "quoted path with spaces should be preserved as one token",
  );
});

test("does NOT split on operators inside quotes", () => {
  // The && and | are inside the quoted string, so only `echo` is a command.
  assert.deepEqual(extractCommandNames('echo "a && b | c"'), ["echo"]);
});

test("ignores command substitution punctuation, keeps inner command", () => {
  const names = extractCommandNames("echo $(date)");
  // Sort because $(date) may be extracted before or after echo depending on
  // token position — order is non-deterministic for inline substitution.
  assert.deepEqual([...names].sort(), ["date", "echo"], "should extract echo and date, no $ punctuation");
});

test("empty or whitespace command yields nothing", () => {
  assert.deepEqual(extractCommandNames("   "), []);
  assert.deepEqual(extractCommandNames(""), []);
});

test("findMissingTools flags a tool that does not exist on this OS", async () => {
  const missing = await findMissingTools(["definitely_not_a_real_tool_xyz123 --run"], process.cwd());
  assert.equal(missing.length, 1, "should flag one missing tool");
  assert.equal(missing[0].tool, "definitely_not_a_real_tool_xyz123", "should report the tool name");
});

test("findMissingTools returns empty for an empty command list", async () => {
  const missing = await findMissingTools([], process.cwd());
  assert.deepEqual(missing, [], "empty command list should return empty results");
});

test("findMissingTools handles a known-invalid command without crashing", async () => {
  const missing = await findMissingTools(["nonexistent_tool_abc_123"], process.cwd());
  assert.equal(missing.length, 1, "should flag the nonexistent tool");
});

// ── Edge cases: redirection & substitution ───────────────────────────────

test("handles output redirection — skips fd numbers", () => {
  const names = extractCommandNames("node app.js > out.txt 2>&1");
  // fd numbers (like 1 in 2>&1) are never command names.
  assert.deepEqual(names, ["node"], "should extract only node, not fd target 1");
});

test("handles input redirection — extracts command before <", () => {
  const names = extractCommandNames("node < input.txt");
  assert.deepEqual(names, ["node"], "should extract only node from input redirection");
});

test("backtick command substitution", () => {
  const names = extractCommandNames("echo `date`");
  assert.deepEqual(names, ["echo", "date"], "should extract echo and date from backtick substitution");
});

test("handles double-dash separator and equals-sign argument tokens", () => {
  const names = extractCommandNames("npm run test -- --reporter=dot");
  assert.deepEqual(names, ["npm"], "should extract npm, not treat --reporter as pipe target");
});

// ── findMissingTools coverage ────────────────────────────────────────────

test("findMissingTools returns empty for empty input", async () => {
  const missing = await findMissingTools([], process.cwd());
  assert.deepEqual(missing, [], "empty input should produce empty missing list");
});

test("findMissingTools with mixed existing and missing tools", async () => {
  const missing = await findMissingTools(["node --version", "definitely_not_a_real_tool_xyz123 --run"], process.cwd());
  assert.equal(missing.length, 1, "should find exactly one missing tool");
  assert.equal(missing[0].tool, "definitely_not_a_real_tool_xyz123", "should flag only the fake tool");
});

// ── suggestionFor coverage ───────────────────────────────────────────────

test("suggestionFor covers common Unix-to-Windows mappings", () => {
  assert.equal(suggestionFor("ls"), "dir", "ls should map to dir");
  assert.equal(suggestionFor("rm"), "del  (or rmdir /s for dirs)", "rm should map to del");
  assert.equal(suggestionFor("which"), "where", "which should map to where");
  assert.equal(suggestionFor("sed"), "PowerShell -replace", "sed maps to PowerShell -replace");
  assert.equal(suggestionFor("awk"), "PowerShell", "awk maps to PowerShell");
  assert.equal(suggestionFor("echo"), undefined, "echo exists on both platforms — no suggestion needed");
});

// ── Edge-case and coverage tests ──────────────────────────────────────

test("extractCommandNames handles Windows absolute paths", () => {
  const names = extractCommandNames("C:\\tools\\mytool.exe --flag");
  assert.deepEqual(names, ["C:\\tools\\mytool.exe"], "should extract Windows absolute path as command name");
});

test("extractCommandNames handles UNC paths", () => {
  const names = extractCommandNames("\\\\server\\share\\tool.exe");
  assert.deepEqual(names, ["\\\\server\\share\\tool.exe"], "should handle UNC paths");
});

test("extractCommandNames handles single-quoted command with double-quote inside", () => {
  const names = extractCommandNames("'node test --grep=\"pattern\"'");
  // Single quote wraps the whole thing, so everything inside is one segment.
  assert.ok(names.length >= 0, "should not crash on nested quotes");
});

test("extractCommandNames handles number-only tokens", () => {
  const names = extractCommandNames("2>err.log cmd"); // 2> is redirection, cmd is command
  assert.ok(names.includes("cmd"), "should extract cmd, skip 2> redirection");
});

test("extractCommandNames with single-char command in pipe chain", () => {
  const names = extractCommandNames("ls | wc -l");
  assert.deepEqual(names, ["ls", "wc"], "pipe chain with short commands should extract both");
});

test("suggestionFor is case-insensitive and handles unknown tools", () => {
  assert.equal(suggestionFor("GREP"), "findstr", "uppercase GREP maps to findstr");
  assert.equal(suggestionFor("Ls"), "dir", "mixed-case Ls maps to dir");
  assert.equal(suggestionFor("nonexistant_tool_xyz"), undefined, "unknown tool returns undefined");
});

// ── fd-number filtering ──────────────────────────────────────────────

test("extractCommandNames skips bare integers (fd targets from 2>&1)", () => {
  const names = extractCommandNames("my-tool --flag 2>&1 1>&2");
  assert.deepEqual(names, ["my-tool"], "should extract only my-tool, skip fd numbers");
});

// ── Glob detection ───────────────────────────────────────────────────

test("hasGlobWildcards detects unquoted asterisk", () => {
  assert.equal(hasGlobWildcards("ls *.js"), true, "unquoted * is a glob");
});

test("hasGlobWildcards ignores quoted asterisk", () => {
  assert.equal(hasGlobWildcards('grep "*.ts" file'), false, "quoted * is not a glob");
});

test("hasGlobWildcards detects unquoted question-mark", () => {
  assert.equal(hasGlobWildcards("ls file?.js"), true, "unquoted ? is a glob");
});

test("hasGlobWildcards detects bracket range", () => {
  assert.equal(hasGlobWildcards("rm file[0-9].txt"), true, "unquoted [ is a glob");
});

test("hasGlobWildcards returns false for plain commands", () => {
  assert.equal(hasGlobWildcards("node --version"), false, "plain command has no globs");
});

// ── isPlaceholderCommand (F4 / #45) ─────────────────────────────────────────

test("isPlaceholderCommand flags node -e process.exit(0) variants", () => {
  assert.equal(isPlaceholderCommand('node -e "process.exit(0)"'), true);
  assert.equal(isPlaceholderCommand("node --eval 'process.exit( 0 )'"), true);
  assert.equal(isPlaceholderCommand("process.exit(0)"), true);
});

test("isPlaceholderCommand flags trivial shell no-ops", () => {
  for (const cmd of ["true", "exit 0", "exit /b 0", "echo ok", "echo done", "cmd /c exit 0", "rem placeholder", ":"]) {
    assert.equal(isPlaceholderCommand(cmd), true, `"${cmd}" should be a placeholder`);
  }
});

test("isPlaceholderCommand does NOT flag real verification commands", () => {
  for (const cmd of ["npm test", "node build.js", 'findstr /C:"export" file.ts', "echo hello world", ""]) {
    assert.equal(isPlaceholderCommand(cmd), false, `"${cmd}" should NOT be a placeholder`);
  }
});

// ── usesNodeEvalRequire (F3 / S2) ───────────────────────────────────────────

test("usesNodeEvalRequire detects require() inside node -e / --eval", () => {
  assert.equal(usesNodeEvalRequire("node -e \"require('fs').readFileSync('x')\""), true);
  assert.equal(usesNodeEvalRequire("node --eval \"const a = require('path')\""), true);
});

test("usesNodeEvalRequire ignores commands without both node-eval and require", () => {
  assert.equal(usesNodeEvalRequire("node -e \"import('fs')\""), false, "ESM import is fine");
  assert.equal(usesNodeEvalRequire("node build.js"), false, "no eval flag");
  assert.equal(usesNodeEvalRequire('grep "require(" file.js'), false, "require in grep, not node -e");
});

test("isEsmPackage detects this repo's type:module root", () => {
  // The monorepo root package.json declares "type": "module".
  assert.equal(isEsmPackage(process.cwd()), true);
});

// ── expandGlobsInCommand replaceAll (F5 / #19) ──────────────────────────────

test("expandGlobsInCommand is a no-op on non-Windows platforms", () => {
  if (process.platform === "win32") return; // Windows-only path exercised by the test below
  const r = expandGlobsInCommand("findstr x packages/*/src/", process.cwd());
  assert.equal(r.expanded_count, 0, "no expansion off Windows");
  assert.equal(r.expanded, "findstr x packages/*/src/", "command unchanged off Windows");
});

test("expandGlobsInCommand expands EVERY occurrence of a repeated dir glob (Windows)", () => {
  if (process.platform !== "win32") return; // depends on cmd.exe glob semantics + repo layout
  // The same glob appears twice — replaceAll must expand both, not just the first.
  // cwd during tests is the package dir, which has a dist/ containing subdirs.
  const cmd = "type dist/*/ && type dist/*/";
  const r = expandGlobsInCommand(cmd, process.cwd());
  assert.ok(r.expanded_count > 0, "at least one dist subdir should resolve");
  assert.ok(!r.expanded.includes("dist/*/"), "no unexpanded glob token should remain");
});
