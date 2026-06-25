import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCommandNames, findMissingTools } from "./command-check.js";

test("extracts a simple command", () => {
  assert.deepEqual(extractCommandNames("grep -i foo file.txt"), ["grep"]);
});

test("extracts both sides of a pipe", () => {
  assert.deepEqual(extractCommandNames("npm test | grep -i fail"), ["npm", "grep"]);
});

test("extracts across && and || and ; chains", () => {
  assert.deepEqual(extractCommandNames("cargo build && cargo test"), ["cargo"]);
  assert.deepEqual(extractCommandNames("echo hi; ls -la"), ["echo", "ls"]);
  assert.deepEqual(extractCommandNames("a.exe || b.exe"), ["a.exe", "b.exe"]);
});

test("chained pipes return each stage", () => {
  assert.deepEqual(extractCommandNames("cat x | sort | head -n5"), ["cat", "sort", "head"]);
});

test("skips leading env-assignments (posix style)", () => {
  assert.deepEqual(extractCommandNames("FOO=1 BAR=2 node app.js"), ["node"]);
});

test("handles a quoted executable path with spaces", () => {
  assert.deepEqual(extractCommandNames('"C:\\Program Files\\app\\tool.exe" --check'), [
    "C:\\Program Files\\app\\tool.exe",
  ]);
});

test("does NOT split on operators inside quotes", () => {
  // The && and | are inside the quoted string, so only `echo` is a command.
  assert.deepEqual(extractCommandNames('echo "a && b | c"'), ["echo"]);
});

test("ignores command substitution punctuation, keeps inner command", () => {
  const names = extractCommandNames("echo $(date)");
  assert.ok(names.includes("echo"));
  assert.ok(names.includes("date"));
  assert.ok(!names.includes("$"));
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
  assert.deepEqual(missing, []);
});
