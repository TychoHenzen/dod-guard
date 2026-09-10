import assert from "node:assert/strict";
import { test } from "node:test";
import { strip } from "./strip.mjs";

test("the length invariant holds across language fixtures", () => {
  const tick = String.fromCharCode(96);
  const fixtures = [
    ["ts", "const x = " + tick + "hello world" + tick + ";"],
    ["ts", tick + "a" + "$" + "{1+2}b" + tick + ";"],
    ["ts", tick + "$" + '{foo("}")}' + tick + ";"],
    [
      "ts",
      tick + "$" + "{" + tick + "x" + "$" + "{1}y" + tick + "}" + tick + ";",
    ],
    ["ts", tick + "$" + "{a +\nb}" + tick + ";"],
    ["ts", tick + "abc"],
    ["ts", "// a comment\nconst z = 1;"],
    ["cs", "let x = " + tick + "a" + tick + ";"],
    ["py", '"""doc"""\nx = 1'],
  ];
  for (const [lang, src] of fixtures)
    assert.equal(strip(src, lang).code.length, src.length);
});

test("a template with no interpolation is blanked", () => {
  const tick = String.fromCharCode(96);
  const src = "const x = " + tick + "hello world" + tick + ";";
  assert.equal(strip(src, "ts").code, "const x = " + " ".repeat(13) + ";");
});

test("code inside an interpolation survives", () => {
  const tick = String.fromCharCode(96);
  const src = "const y = " + tick + "a" + "$" + "{1+2}b" + tick + ";";
  const expected = "const y = " + " ".repeat(4) + "1+2" + " ".repeat(3) + ";";
  assert.equal(strip(src, "ts").code, expected);
});

test("an escaped backtick does not close a template", () => {
  const tick = String.fromCharCode(96);
  const src = tick + "a\\" + tick + "b" + tick + ";";
  assert.equal(strip(src, "ts").code, " ".repeat(6) + ";");
});

test("an escaped dollar does not open interpolation", () => {
  const tick = String.fromCharCode(96);
  const src = tick + "\\" + "$" + "{x}" + tick + ";";
  assert.equal(strip(src, "ts").code, " ".repeat(7) + ";");
});

test("a brace inside a quoted interpolation string is ignored", () => {
  const tick = String.fromCharCode(96);
  const src = tick + "$" + '{foo("}")}' + tick + ";";
  const expected =
    " ".repeat(3) + "foo(" + " ".repeat(3) + ")" + " ".repeat(2) + ";";
  assert.equal(strip(src, "ts").code, expected);
});

test("a nested template strips to any depth", () => {
  const tick = String.fromCharCode(96);
  const src =
    tick + "$" + "{" + tick + "x" + "$" + "{1}y" + tick + "}" + tick + ";";
  assert.equal(
    strip(src, "ts").code,
    " ".repeat(7) + "1" + " ".repeat(5) + ";",
  );
});

test("multiline interpolation keeps newlines and code", () => {
  const tick = String.fromCharCode(96);
  const src = tick + "$" + "{a +\nb}" + tick + ";";
  const expected = " ".repeat(3) + "a +\nb" + " ".repeat(2) + ";";
  assert.equal(strip(src, "ts").code, expected);
});

test("an unterminated template blanks to the end", () => {
  const src = String.fromCharCode(96) + "abc";
  const { code } = strip(src, "ts");
  assert.equal(code, " ".repeat(4));
  assert.equal(code.length, src.length);
});

test("non-ts languages leave backticks alone", () => {
  const tick = String.fromCharCode(96);
  const src = "let x = " + tick + "a" + tick + ";";
  assert.equal(strip(src, "cs").code, src);
});
