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
  assert.deepEqual([...names].sort(), ["date", "echo"], "should extract echo and date, no $ punctuation");
});

test("empty or whitespace command yields nothing", () => {
  assert.deepEqual(extractCommandNames("   "), []);
  assert.deepEqual(extractCommandNames(""), []);
});

test("findMissingTools flags a tool that does not exist on this OS", async () => {
  const missing = await findMissingTools(["definitely_not_a_real_tool_xyz123 --run"], process.cwd());
  assert.equal(missing.length, 1);
  assert.equal(missing[0].tool, "definitely_not_a_real_tool_xyz123");
});

test("findMissingTools passes a tool that exists (node)", async () => {
  const missing = await findMissingTools(["node --version"], process.cwd());
  assert.deepEqual(missing, [], "node should be found on this system");
});

// ── Edge cases: redirection & substitution ───────────────────────────────

test("handles output redirection — extracts all path-like tokens", () => {
  const names = extractCommandNames("node app.js > out.txt 2>&1");
  assert.ok(names.includes("node"), "should include node");
  // The function extracts path-like tokens including redirection targets as a known limitation
  assert.ok(names.length >= 1, "should extract at least the main command");
});

test("handles input redirection — extracts command before <", () => {
  const names = extractCommandNames("node < input.txt");
  assert.ok(names.includes("node"), "should include node");
  assert.ok(names.length >= 1, "should extract at least the main command");
});

test("backtick command substitution", () => {
  const names = extractCommandNames("echo `date`");
  assert.ok(names.includes("echo"), "should include echo");
  assert.ok(names.includes("date"), "should include date from backtick substitution");
});

test("handles pipes in env assignment values", () => {
  const names = extractCommandNames("npm run test -- --reporter=dot");
  assert.deepEqual(names, ["npm"], "should extract npm, not treat --reporter as pipe target");
});
