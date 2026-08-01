import assert from "node:assert/strict";
import { test } from "node:test";
import { strip } from "./strip.mjs";

// Each fixture below is traced by hand, char by char, in the comment above
// it. Expected strings come from that trace, built with `.repeat()`. They
// are never pasted from a run of `strip` itself.

test("length invariant holds for a spread of fixtures", () => {
  const fixtures = [
    { lang: "ts", src: "const x = `hello world`;" },
    { lang: "ts", src: "const y = `a${1+2}b`;" },
    { lang: "ts", src: '`${foo("}")}`;' },
    { lang: "ts", src: "`${`x${1}y`}`;" },
    { lang: "ts", src: "`${a +\nb}`;" },
    { lang: "ts", src: "`abc" },
    { lang: "ts", src: "// a comment\nconst z = 1;" },
    { lang: "cs", src: 'let x = `a`;' },
    { lang: "py", src: '"""doc"""\nx = 1' },
  ];
  for (const { lang, src } of fixtures) {
    const { code } = strip(src, lang);
    assert.equal(code.length, src.length, `length mismatch for ${JSON.stringify(src)}`);
  }
});

test("a template with no interpolation is blanked like a string", () => {
  // Chars 0-9 are "const x = ". Untouched.
  // Chars 10-22 are the template "`hello world`", 13 chars. All blanked.
  // Char 23 is the closing punctuation. Untouched.
  const src = "const x = `hello world`;";
  const expected = "const x = " + " ".repeat(13) + ";";
  assert.equal(strip(src, "ts").code, expected);
});

test("code inside an interpolation survives, delimiters are blanked", () => {
  // Chars 0-9 are "const y = ". Untouched.
  // Char 10 is the open backtick. Blanked.
  // Char 11 is "a", template text. Blanked.
  // Chars 12-13 are the open marker. Blanked.
  // Chars 14-16 are "1+2", real code. Untouched.
  // Char 17 is the close brace. Blanked.
  // Char 18 is "b", template text. Blanked.
  // Char 19 is the close backtick. Blanked.
  // Char 20 is the closing punctuation. Untouched.
  const src = "const y = `a${1+2}b`;";
  const expected = "const y = " + " ".repeat(4) + "1+2" + " ".repeat(3) + ";";
  assert.equal(strip(src, "ts").code, expected);
});

test("an escaped backtick in template text does not close the literal", () => {
  // Char 0 opens the template. Blanked.
  // Char 1 is "a", template text. Blanked.
  // Chars 2-3 are one escape pair. Blanked. The backtick here stays text.
  // Char 4 is "b", template text. Blanked.
  // Char 5 closes the template. Blanked.
  // Char 6 is the closing punctuation. Untouched.
  const src = "`a\\`b`;";
  const expected = `${" ".repeat(6)};`;
  assert.equal(strip(src, "ts").code, expected);
});

test("an escaped dollar sign does not open an interpolation", () => {
  // Char 0 opens the template. Blanked.
  // Chars 1-2 are one escape pair. Blanked.
  // Chars 3-5 are plain template text now, no interpolation opened. Blanked.
  // Char 6 closes the template. Blanked.
  // Char 7 is the closing punctuation. Untouched.
  const src = "`\\${x}`;";
  const expected = `${" ".repeat(7)};`;
  assert.equal(strip(src, "ts").code, expected);
});

test("a close brace inside a quoted string does not end the interpolation", () => {
  // Char 0 opens the template. Blanked.
  // Chars 1-2 open the interpolation. Blanked.
  // Chars 3-6 are "foo(", real code. Untouched.
  // Chars 7-9 are a quoted string holding a brace. All three blanked.
  // Char 10 is the close paren, real code. Untouched.
  // Char 11 closes the interpolation, depth zero. Blanked.
  // Char 12 closes the template. Blanked.
  // Char 13 is the closing punctuation. Untouched.
  const src = '`${foo("}")}`;';
  const expected = `${" ".repeat(3)}foo(${" ".repeat(3)})${" ".repeat(2)};`;
  assert.equal(strip(src, "ts").code, expected);
});

test("a template nested inside an interpolation strips to any depth", () => {
  // Char 0 opens the outer template. Blanked.
  // Chars 1-2 open the outer interpolation. Blanked.
  // Char 3 opens a nested template. Blanked.
  // Char 4 is "x", nested template text. Blanked.
  // Chars 5-6 open a nested interpolation. Blanked.
  // Char 7 is "1", real code. Untouched.
  // Char 8 closes the nested interpolation. Blanked.
  // Char 9 is "y", nested template text. Blanked.
  // Char 10 closes the nested template. Blanked.
  // Char 11 closes the outer interpolation. Blanked.
  // Char 12 closes the outer template. Blanked.
  // Char 13 is the closing punctuation. Untouched.
  const src = "`${`x${1}y`}`;";
  const expected = `${" ".repeat(7)}1${" ".repeat(5)};`;
  assert.equal(strip(src, "ts").code, expected);
});

test("an interpolation over several lines keeps its newline and its code", () => {
  // Char 0 opens the template. Blanked.
  // Chars 1-2 open the interpolation. Blanked.
  // Chars 3-7 are "a +", a space, and a newline. All real code. Untouched.
  // Char 8 is "b", real code. Untouched.
  // Char 9 closes the interpolation. Blanked.
  // Char 10 closes the template. Blanked.
  // Char 11 is the closing punctuation. Untouched.
  const src = "`${a +\nb}`;";
  const expected = `${" ".repeat(3)}a +\nb${" ".repeat(2)};`;
  assert.equal(strip(src, "ts").code, expected);
});

test("an unterminated template blanks to the end with no crash", () => {
  const src = "`abc";
  const expected = " ".repeat(4);
  const { code } = strip(src, "ts");
  assert.equal(code, expected);
  assert.equal(code.length, src.length);
});

test("a non-ts language leaves backticks alone entirely", () => {
  const src = "let x = `a`;";
  assert.equal(strip(src, "cs").code, src);
});
