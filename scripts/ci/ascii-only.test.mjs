import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findNonAscii } from "./lib/ascii-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EM_DASH = 0x2014;
const RIGHT_ARROW = 0x2192;
const BOM = 0xfeff;
const GRINNING_FACE = 0x1f600;

test("an em-dash on line 2 is reported with its path, line, and code point", () => {
  const text = `const a = 1;\n// x ${String.fromCodePoint(EM_DASH)} y\n`;
  assert.deepEqual(findNonAscii({ path: "x.mjs", text }), ["x.mjs:2 U+2014"]);
});

test("an arrow and a leading BOM are each reported", () => {
  const arrow = `a ${String.fromCodePoint(RIGHT_ARROW)} b\n`;
  assert.deepEqual(findNonAscii({ path: "a.mjs", text: arrow }), ["a.mjs:1 U+2192"]);
  const bom = `${String.fromCodePoint(BOM)}export {};\n`;
  assert.deepEqual(findNonAscii({ path: "b.mjs", text: bom }), ["b.mjs:1 U+FEFF"]);
});

test("an astral character yields exactly one row", () => {
  const text = `ok\nsmile ${String.fromCodePoint(GRINNING_FACE)}\n`;
  assert.deepEqual(findNonAscii({ path: "s.mjs", text }), ["s.mjs:2 U+1F600"]);
});

test("ASCII text with tab, LF, and CRLF has no rows", () => {
  const text = "a\tb\nc\r\nd\r\n";
  assert.deepEqual(findNonAscii({ path: "t.mjs", text }), []);
});

test("every tracked scripts/ci file is ASCII", () => {
  const files = execFileSync("git", ["ls-files", "scripts/ci"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  assert.ok(files.length > 0, "git ls-files scripts/ci listed no files");
  const rows = files.flatMap((path) => findNonAscii({ path, text: readFileSync(join(ROOT, path), "utf8") }));
  assert.deepEqual(rows, [], `non-ASCII in scripts/ci:\n${rows.join("\n")}`);
});
