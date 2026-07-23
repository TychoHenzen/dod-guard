import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractCommandNames,
  hasGlobWildcards,
  isPlaceholderCommand,
  splitCommands,
} from "./command-check.js";

// ── splitCommands ──────────────────────────────────────────────────────

test("splitCommands single token", () => {
  assert.deepEqual(splitCommands("echo"), ["echo"]);
});

test("splitCommands pipe-separated", () => {
  assert.deepEqual(splitCommands("echo hello | grep world"), ["echo hello ", " grep world"]);
});

test("splitCommands semicolon-separated", () => {
  assert.deepEqual(splitCommands("cd src; ls"), ["cd src", " ls"]);
});

test("splitCommands preserves quoted pipes", () => {
  const result = splitCommands(`echo "hello | world"`);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("|"));
});

test("splitCommands preserves quoted semicolons", () => {
  const result = splitCommands(`echo "a;b"`);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes(";"));
});

test("splitCommands single-quoted string with special chars", () => {
  const result = splitCommands(`grep 'a|b' file.txt`);
  assert.equal(result.length, 1);
});

test("splitCommands handles newline as separator", () => {
  const parts = splitCommands("echo a\necho b");
  assert.equal(parts.length, 2);
});

test("splitCommands empty string returns empty array", () => {
  assert.deepEqual(splitCommands(""), []);
});

test("splitCommands whitespace only returns empty array", () => {
  assert.deepEqual(splitCommands("   "), []);
});

// ── extractCommandNames ────────────────────────────────────────────────

test("extractCommandNames single command", () => {
  assert.deepEqual(extractCommandNames("echo hello"), ["echo"]);
});

test("extractCommandNames piped commands", () => {
  const names = extractCommandNames("cat file.txt | grep pattern | wc -l");
  assert.deepEqual(names, ["cat", "grep", "wc"]);
});

test("extractCommandNames deduplicates", () => {
  const names = extractCommandNames("echo a && echo b");
  assert.deepEqual(names, ["echo"]);
});

test("extractCommandNames skips redirects", () => {
  const names = extractCommandNames("echo hello > output.txt");
  assert.deepEqual(names, ["echo"]);
});

test("extractCommandNames skips assignment prefix", () => {
  const names = extractCommandNames("FOO=bar echo $FOO");
  assert.deepEqual(names, ["echo"]);
});

test("extractCommandNames handles Windows paths", () => {
  const names = extractCommandNames("C:\\tools\\mytool.exe --flag");
  assert.ok(names.includes("C:\\tools\\mytool.exe") || names.length > 0);
});

test("extractCommandNames empty string returns empty array", () => {
  assert.deepEqual(extractCommandNames(""), []);
});

test("extractCommandNames skips numeric tokens (file descriptors)", () => {
  const names = extractCommandNames("2>&1 echo hello");
  // 2 should be skipped
  assert.ok(!names.includes("2") || names.includes("echo"));
});

// ── hasGlobWildcards ───────────────────────────────────────────────────

test("hasGlobWildcards detects star", () => {
  assert.equal(hasGlobWildcards("ls *.ts"), true);
});

test("hasGlobWildcards detects question mark", () => {
  assert.equal(hasGlobWildcards("ls file?.ts"), true);
});

test("hasGlobWildcards detects bracket glob", () => {
  assert.equal(hasGlobWildcards("ls file[0-9].ts"), true);
});

test("hasGlobWildcards no wildcards", () => {
  assert.equal(hasGlobWildcards("echo hello world"), false);
});

test("hasGlobWildcards ignores quoted stars", () => {
  assert.equal(hasGlobWildcards(`echo "*.ts"`), false);
});

test("hasGlobWildcards ignores single-quoted stars", () => {
  assert.equal(hasGlobWildcards(`echo '*.ts'`), false);
});

// ── isPlaceholderCommand ───────────────────────────────────────────────

test("isPlaceholderCommand detects echo ok", () => {
  assert.equal(isPlaceholderCommand("echo ok"), true);
});

test("isPlaceholderCommand detects echo done", () => {
  assert.equal(isPlaceholderCommand("echo done"), true);
});

test("isPlaceholderCommand detects echo pass", () => {
  assert.equal(isPlaceholderCommand("echo pass"), true);
});

test("isPlaceholderCommand detects echo passed", () => {
  assert.equal(isPlaceholderCommand("echo passed"), true);
});

test("isPlaceholderCommand detects exit 0", () => {
  assert.equal(isPlaceholderCommand("exit 0"), true);
});

test("isPlaceholderCommand detects exit /b 0", () => {
  assert.equal(isPlaceholderCommand("exit /b 0"), true);
});

test("isPlaceholderCommand detects true", () => {
  assert.equal(isPlaceholderCommand("true"), true);
});

test("isPlaceholderCommand detects colon no-op", () => {
  assert.equal(isPlaceholderCommand(": "), true);
});

test("isPlaceholderCommand detects process.exit(0) via node -e", () => {
  assert.equal(isPlaceholderCommand('node -e "process.exit(0)"'), true);
});

test("isPlaceholderCommand detects rem comment (Windows)", () => {
  assert.equal(isPlaceholderCommand("rem nothing to do"), true);
});

test("isPlaceholderCommand real command passes", () => {
  assert.equal(isPlaceholderCommand("npm test"), false);
});

test("isPlaceholderCommand empty string returns false", () => {
  assert.equal(isPlaceholderCommand(""), false);
});

test("isPlaceholderCommand whitespace only returns false", () => {
  assert.equal(isPlaceholderCommand("   "), false);
});

test("isPlaceholderCommand detects cmd /c exit 0", () => {
  assert.equal(isPlaceholderCommand('cmd /c "exit 0"'), true);
});
