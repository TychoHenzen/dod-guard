// EditorConfig section matching: the glob syntax, and patterns that would
// hang a backtracking matcher.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { matchesSection } from "../../../../../skills/quality-refactor/scripts/lib/editorconfig-glob.mjs";

const GLOB_MODULE = new URL(
  "../../../../../skills/quality-refactor/scripts/lib/editorconfig-glob.mjs",
  import.meta.url,
).href;
const LONG_PATH = `${"a".repeat(121)}.cs`;

// A synchronous hang cannot be interrupted in-process, so the match runs in
// a child: the timeout kills a hang, and the small heap turns a runaway
// allocation into a crash. The child reports the match and its own time.
function timedMatch(pattern, path) {
  const script =
    `const { matchesSection } = await import(${JSON.stringify(GLOB_MODULE)});` +
    "const start = performance.now();" +
    `const matched = matchesSection(${JSON.stringify(pattern)}, ` +
    `${JSON.stringify(path)});` +
    "console.log(JSON.stringify({ matched, ms: performance.now() - start }));";
  const args = ["--max-old-space-size=32", "--input-type=module", "-e", script];
  const run = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(run.error, undefined, `${pattern} did not finish`);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

const HOSTILE = {
  "30 stars then x": `${"*".repeat(30)}x`,
  "*a 20 times then x": `${"*a".repeat(20)}x`,
  "?* 25 times then x": `${"?*".repeat(25)}x`,
  "[a]* 25 times then x": `${"[a]*".repeat(25)}x`,
};

for (const [name, pattern] of Object.entries(HOSTILE)) {
  test(`${name} fails a 124-char path well under a second`, () => {
    assert.equal(LONG_PATH.length, 124);
    const { matched, ms } = timedMatch(pattern, LONG_PATH);
    assert.equal(matched, false);
    assert.ok(ms < 250, `${name} took ${ms} ms`);
  });
}

test("a range past the safe integers finishes and compares exactly", () => {
  const range = "{9007199254740992..9007199254740992}";
  assert.equal(timedMatch(range, "9007199254740992").matched, true);
  assert.equal(timedMatch(range, "9007199254740993").matched, false);
});

test("a numeric range matches its members by value", () => {
  assert.equal(matchesSection("{1..3}", "2"), true);
  assert.equal(matchesSection("{1..3}", "4"), false);
  assert.equal(matchesSection("{3..1}.cs", "1.cs"), true);
  assert.equal(matchesSection("a{-2..2}.cs", "a-1.cs"), true);
  assert.equal(matchesSection("{1..3}5", "25"), true);
  assert.equal(matchesSection("{1..1000000}.cs", "999999.cs"), true);
});

test("character sets take spans, a negation and a literal dash", () => {
  assert.equal(matchesSection("[a-c].cs", "b.cs"), true);
  assert.equal(matchesSection("[a-c].cs", "d.cs"), false);
  assert.equal(matchesSection("[!a].cs", "b.cs"), true);
  assert.equal(matchesSection("[!a].cs", "a.cs"), false);
  assert.equal(matchesSection("[a-].cs", "-.cs"), true);
  assert.equal(matchesSection("[].cs", "[].cs"), true);
  assert.equal(matchesSection("[z-a].cs", "b.cs"), false);
});

test("braces nest, and a single part stays literal", () => {
  assert.equal(matchesSection("{a,{b,c}}.cs", "c.cs"), true);
  assert.equal(matchesSection("{a,{b,c}}.cs", "d.cs"), false);
  assert.equal(matchesSection("{a}.cs", "{a}.cs"), true);
  assert.equal(matchesSection("{a.cs", "{a.cs"), true);
});

test("stars stay within a directory, and ** crosses them", () => {
  assert.equal(matchesSection("lib/**/x.cs", "lib/x.cs"), true);
  assert.equal(matchesSection("lib/**/x.cs", "lib/a/b/x.cs"), true);
  assert.equal(matchesSection("lib/*.cs", "lib/a/x.cs"), false);
  assert.equal(matchesSection("lib/?.cs", "lib/x.cs"), true);
  assert.equal(matchesSection("/lib/*.cs", "lib/x.cs"), true);
  assert.equal(matchesSection("*.cs", "deep/er/x.cs"), true);
  assert.equal(matchesSection("[a]*[b]*.cs", "ba.cs"), false);
});

test("a backslash makes the next character literal", () => {
  assert.equal(matchesSection(String.raw`a\*.cs`, "a*.cs"), true);
  assert.equal(matchesSection(String.raw`a\*.cs`, "ab.cs"), false);
});
