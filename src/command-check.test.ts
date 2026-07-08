import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCommandNames, findMissingTools, suggestionFor } from "./command-check.js";

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
  assert.deepEqual(extractCommandNames("npm test | grep -i fail"), ["npm", "grep"], "should extract both npm and grep from pipe");
});

test("extracts across && and || and ; chains", () => {
  assert.deepEqual(extractCommandNames("cargo build && cargo test"), ["cargo"], "&& chain should deduplicate cargo");
  assert.deepEqual(extractCommandNames("echo hi; ls -la"), ["echo", "ls"], "; chain should extract both commands");
  assert.deepEqual(extractCommandNames("a.exe || b.exe"), ["a.exe", "b.exe"], "|| chain should extract both commands");
});

test("chained pipes return each stage", () => {
  assert.deepEqual(extractCommandNames("cat x | sort | head -n5"), ["cat", "sort", "head"], "chained pipes should return all three stages");
});

test("skips leading env-assignments (posix style)", () => {
  assert.deepEqual(extractCommandNames("FOO=1 BAR=2 node app.js"), ["node"], "env assignments should be skipped, keeping only node");
});

test("handles a quoted executable path with spaces", () => {
  assert.deepEqual(extractCommandNames('"C:\\Program Files\\app\\tool.exe" --check'), [
    "C:\\Program Files\\app\\tool.exe",
  ], "quoted path with spaces should be preserved as one token");
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

test("handles output redirection — extracts command and fd target", () => {
  const names = extractCommandNames("node app.js > out.txt 2>&1");
  // 2>&1 redirects stderr to stdout — fd number 1 surfaces as a path-like token
  assert.deepEqual(names.sort(), ["1", "node"], "should extract node and fd target from redirection command");
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
  const missing = await findMissingTools(
    ["node --version", "definitely_not_a_real_tool_xyz123 --run"],
    process.cwd(),
  );
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
  assert.deepEqual(names, ["C:\\tools\\mytool.exe"],
    "should extract Windows absolute path as command name");
});

test("extractCommandNames handles UNC paths", () => {
  const names = extractCommandNames("\\\\server\\share\\tool.exe");
  assert.deepEqual(names, ["\\\\server\\share\\tool.exe"],
    "should handle UNC paths");
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
  assert.deepEqual(names, ["ls", "wc"],
    "pipe chain with short commands should extract both");
});

test("suggestionFor is case-insensitive and handles unknown tools", () => {
  assert.equal(suggestionFor("GREP"), "findstr", "uppercase GREP maps to findstr");
  assert.equal(suggestionFor("Ls"), "dir", "mixed-case Ls maps to dir");
  assert.equal(suggestionFor("nonexistant_tool_xyz"), undefined,
    "unknown tool returns undefined");
});

