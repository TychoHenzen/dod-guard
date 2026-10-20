import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { toAsciiBundle } from "../build/ascii-output.mjs";
import { bundlePackage } from "../build/bundle.mjs";
import { findNonAscii } from "./lib/ascii-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EM_DASH = 0x20_14;
const RIGHT_ARROW = 0x21_92;
const BOM = 0xfe_ff;
const GRINNING_FACE = 0x1_f6_00;
const E_ACUTE = 0xe9;
const DASH = String.fromCodePoint(EM_DASH);
const TWO_OFFENDERS_ON_LINES_2_AND_3 = /in\.js:2:\d+ U\+2014[\s\S]*in\.js:3:\d+ U\+2014/;
const CANNOT_PARSE_MESSAGE = /^in\.js: cannot parse/;
const RAW_OUTPUT_MESSAGE = /bundle\.js:\d+:\d+ U\+2014/;

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

test("toAsciiBundle escapes an em-dash in line, block, and bang comments", () => {
  const text = `// a ${DASH} b\n/* c ${DASH} d */\n/*! e ${DASH} f */\nconst x = 1;\n`;
  const result = toAsciiBundle({ text, file: "in.js" });
  assert.equal(result, text.replaceAll(DASH, "\\u2014"));
});

test("toAsciiBundle escapes an astral character in a comment as two surrogate escapes", () => {
  const text = `// ${String.fromCodePoint(GRINNING_FACE)}\n`;
  assert.equal(toAsciiBundle({ text, file: "in.js" }), "// \\ud83d\\ude00\n");
});

test("toAsciiBundle returns ASCII text with tab, LF, and CRLF unchanged", () => {
  const text = "const a = 1;\r\n\tconst b = 2;\n";
  assert.equal(toAsciiBundle({ text, file: "in.js" }), text);
});

test("toAsciiBundle leaves ASCII control characters in a comment unchanged", () => {
  const text = "// a\u0001b\u007fc\n";
  assert.equal(toAsciiBundle({ text, file: "in.js" }), text);
});

test("toAsciiBundle fails on a String.raw template and reports file, line, column, and code point", () => {
  const text = `const a = String.raw\`x ${DASH}\`;\n`;
  assert.throws(() => toAsciiBundle({ text, file: "in.js" }), {
    message: new RegExp(`^in\\.js:1:${text.indexOf(DASH) + 1} U\\+2014 `),
  });
});

test("toAsciiBundle fails on a tagged template", () => {
  const text = `const a = tag\`x ${DASH}\`;\n`;
  assert.throws(() => toAsciiBundle({ text, file: "in.js" }), {
    message: new RegExp(`^in\\.js:1:${text.indexOf(DASH) + 1} U\\+2014 `),
  });
});

test("toAsciiBundle fails on a regex literal", () => {
  const text = `const r = /${DASH}+/u;\n`;
  assert.throws(() => toAsciiBundle({ text, file: "in.js" }), {
    message: new RegExp(`^in\\.js:1:${text.indexOf(DASH) + 1} U\\+2014 `),
  });
});

test("toAsciiBundle reports every offender with its own line", () => {
  const text = `const a = 1;\nconst r = /${DASH}/;\nconst s = String.raw\`${DASH}\`;\n`;
  assert.throws(() => toAsciiBundle({ text, file: "in.js" }), { message: TWO_OFFENDERS_ON_LINES_2_AND_3 });
});

test("toAsciiBundle ignores a comment while failing on code on the same line", () => {
  const text = `/* ${DASH} */ const r = /${DASH}/;\n`;
  assert.throws(
    () => toAsciiBundle({ text, file: "in.js" }),
    (error) => {
      assert.equal(error.message.match(/U\+2014/g).length, 1);
      return true;
    },
  );
});

test("toAsciiBundle fails with the file name on output it cannot parse", () => {
  assert.throws(() => toAsciiBundle({ text: `const = ;\n// ${DASH}\n`, file: "in.js" }), {
    message: CANNOT_PARSE_MESSAGE,
  });
});

test("toAsciiBundle accepts a hashbang line", () => {
  const text = `#!/usr/bin/env node\n// ${DASH}\n`;
  assert.equal(toAsciiBundle({ text, file: "in.js" }), "#!/usr/bin/env node\n// \\u2014\n");
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

test("bundlePackage rejects a String.raw source and writes no output file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ascii-bundle-raw-"));
  try {
    const entryPoint = join(dir, "in.js");
    const outfile = join(dir, "out", "bundle.js");
    writeFileSync(entryPoint, `export const raw = String.raw\`a ${DASH}\`;\n`);
    await assert.rejects(bundlePackage({ entryPoint, outfile, shebang: false }), {
      message: RAW_OUTPUT_MESSAGE,
    });
    assert.equal(existsSync(outfile), false);
    writeFileSync(entryPoint, "export const raw = String.raw`a \\u2014`;\n");
    await bundlePackage({ entryPoint, outfile, shebang: false });
    assert.deepEqual(findNonAscii({ path: "bundle.js", text: readFileSync(outfile, "utf8") }), []);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("every tracked scripts/ci file is ASCII", () => {
  const rows = scanTracked(ROOT, "scripts/ci");
  assert.deepEqual(rows, [], `non-ASCII in scripts/ci:\n${rows.join("\n")}`);
});

test("a tracked package bundle with an em-dash is reported with its path, line, and code point", () => {
  const repo = mkdtempSync(join(tmpdir(), "ascii-bundle-tracked-"));
  try {
    mkdirSync(join(repo, "packages", "demo", "dist"), { recursive: true });
    writeFileSync(
      join(repo, "packages", "demo", "dist", "bundle.js"),
      `// ok\n// a ${String.fromCodePoint(EM_DASH)} b\n`,
    );
    execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "pipe" });
    execFileSync("git", ["add", "."], { cwd: repo, stdio: "pipe" });
    assert.deepEqual(scanTracked(repo, "packages/*/dist/bundle.js"), ["packages/demo/dist/bundle.js:2 U+2014"]);
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("every tracked package bundle is ASCII", () => {
  const rows = scanTracked(ROOT, "packages/*/dist/bundle.js");
  assert.deepEqual(rows, [], `non-ASCII in package bundles:\n${rows.join("\n")}`);
});
