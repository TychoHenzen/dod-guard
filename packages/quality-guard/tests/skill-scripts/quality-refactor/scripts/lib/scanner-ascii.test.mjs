import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(HERE, "..", "..", "..", "..", "..");
const SCRIPTS = join(PACKAGE, "skills", "quality-refactor", "scripts");
const FIRST_NON_ASCII = 0x80;
const EM_DASH = 0x20_14;
// Scanner messages reach PR comments and terminals that re-encode non-ASCII,
// so an escape that builds such a character is as bad as the character.
const ESCAPES = [
  {
    pattern: /\\u([0-9a-fA-F]{4})/g,
    bad: (hex) => Number.parseInt(hex, 16) >= FIRST_NON_ASCII,
  },
  { pattern: /\\u\{/g, bad: () => true },
  { pattern: /\\x[89a-fA-F][0-9a-fA-F]/g, bad: () => true },
];

// One non-ASCII row per line: a character read as latin1 spans several units.
function lineFindings(line) {
  const escapes = ESCAPES.flatMap(({ pattern, bad }) =>
    [...line.matchAll(pattern)]
      .filter((match) => bad(match[1]))
      .map((match) => `escape ${match[0]}`),
  );
  if (![...line].some((ch) => ch.charCodeAt(0) >= FIRST_NON_ASCII)) {
    return escapes;
  }
  return ["non-ASCII", ...escapes];
}

function findViolations(path, text) {
  return text
    .split("\n")
    .flatMap((line, index) =>
      lineFindings(line).map((found) => `${path}:${index + 1} ${found}`),
    );
}

function moduleFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => join(dir, name));
}

test("the checker names the line of a literal and of each escape form", () => {
  const slash = "\\";
  const text = [
    "const ok = 1;",
    `// a ${String.fromCodePoint(EM_DASH)} b`,
    `const u = "${slash}u2014";`,
    `const braced = "${slash}u{2014}";`,
    `const hex = "${slash}x97";`,
  ].join("\n");
  assert.deepEqual(findViolations("x.mjs", text), [
    "x.mjs:2 non-ASCII",
    `x.mjs:3 escape ${slash}u2014`,
    `x.mjs:4 escape ${slash}u{`,
    `x.mjs:5 escape ${slash}x97`,
  ]);
});

test("ASCII escapes below 0x80 pass", () => {
  const slash = "\\";
  const text = `const a = "${slash}u0041${slash}x41${slash}u007f";\n`;
  assert.deepEqual(findViolations("y.mjs", text), []);
});

test("every scanner module is ASCII with no non-ASCII escape", () => {
  const files = moduleFiles(SCRIPTS);
  assert.ok(
    files.some((file) => file.includes("rules-project")),
    "walk missed subdirectories",
  );
  // latin1 maps each byte to one code unit, so any byte >= 0x80 is caught.
  const rows = files.flatMap((file) =>
    findViolations(
      relative(PACKAGE, file).replaceAll("\\", "/"),
      readFileSync(file, "latin1"),
    ),
  );
  assert.deepEqual(
    rows,
    [],
    `non-ASCII in scanner sources:\n${rows.join("\n")}`,
  );
});
