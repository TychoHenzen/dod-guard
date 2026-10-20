import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { escapeNonAscii } from "../build/ascii-output.mjs";
import { bundlePackage } from "../build/bundle.mjs";
import { findNonAscii } from "./lib/ascii-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EM_DASH = 0x20_14;
const RIGHT_ARROW = 0x21_92;
const BOM = 0xfe_ff;
const GRINNING_FACE = 0x1_f6_00;
const E_ACUTE = 0xe9;

// -z keeps git from C-quoting a path with non-ASCII, a quote, or a backslash;
// a quoted path makes readFileSync throw ENOENT before any row is reported.
function scanTracked(cwd, dir) {
  const files = execFileSync("git", ["ls-files", "-z", dir], { cwd, encoding: "utf8" }).split("\0").filter(Boolean);
  if (files.length === 0) {
    throw new Error(`git ls-files ${dir} listed no files`);
  }
  return files.flatMap((path) => findNonAscii({ path, text: readFileSync(join(cwd, path), "utf8") }));
}

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

test("a tracked file with a non-ASCII name is read and its row reported", () => {
  const repo = mkdtempSync(join(tmpdir(), "ascii-only-"));
  try {
    const name = `scripts/ci/caf${String.fromCodePoint(E_ACUTE)}.mjs`;
    mkdirSync(join(repo, "scripts", "ci"), { recursive: true });
    writeFileSync(join(repo, name), `// a ${String.fromCodePoint(EM_DASH)} b\n`);
    execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "pipe" });
    execFileSync("git", ["add", "."], { cwd: repo, stdio: "pipe" });
    assert.deepEqual(scanTracked(repo, "scripts/ci"), [`${name}:1 U+2014`]);
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("escapeNonAscii turns an em-dash into a backslash-u escape", () => {
  assert.equal(escapeNonAscii(`a ${String.fromCodePoint(EM_DASH)} b`), "a \\u2014 b");
});

test("escapeNonAscii escapes an astral character as two surrogate escapes", () => {
  assert.equal(escapeNonAscii(String.fromCodePoint(GRINNING_FACE)), "\\ud83d\\ude00");
});

test("escapeNonAscii leaves ASCII, tab, LF, and CRLF unchanged", () => {
  const text = "a\tb\nc\r\nd";
  assert.equal(escapeNonAscii(text), text);
});

test("bundlePackage writes ASCII-only output for a comment, a string, and an identifier", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ascii-bundle-"));
  try {
    const dash = String.fromCodePoint(EM_DASH);
    const source = [
      `/** A doc ${dash} comment. */`,
      `const holder = { /** keeps ${dash} raw */ value: 1 };`,
      `const caf${String.fromCodePoint(E_ACUTE)} = "x ${dash} y";`,
      `export { holder, caf${String.fromCodePoint(E_ACUTE)} };`,
      "",
    ].join("\n");
    writeFileSync(join(dir, "in.js"), source);
    await bundlePackage({
      entryPoint: join(dir, "in.js"),
      outfile: join(dir, "out", "bundle.js"),
      shebang: false,
    });
    const text = readFileSync(join(dir, "out", "bundle.js"), "utf8");
    assert.deepEqual(findNonAscii({ path: "bundle.js", text }), []);
    assert.ok(text.includes("\\u2014"));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("every tracked scripts/ci file is ASCII", () => {
  const rows = scanTracked(ROOT, "scripts/ci");
  assert.deepEqual(rows, [], `non-ASCII in scripts/ci:\n${rows.join("\n")}`);
});
