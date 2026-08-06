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

test("a rust lifetime in a generic parameter list survives untouched", () => {
  const src = "fn f<'a>(x: i32) -> i32 { x }";
  assert.equal(strip(src, "rs").code, src);
});

test("a rust lifetime in a reference type survives untouched", () => {
  const src = "fn f(x: &'a str) -> &'a str { x }";
  assert.equal(strip(src, "rs").code, src);
});

test("a rust lifetime bound 'a: 'b survives untouched", () => {
  const src = "fn f<'a, 'b>() where 'a: 'b {}";
  assert.equal(strip(src, "rs").code, src);
});

test("a rust 'static bound survives untouched", () => {
  const src = "fn f<T: 'static>(x: T) {}";
  assert.equal(strip(src, "rs").code, src);
});

test("a full rust signature and body with lifetimes throughout survives intact", () => {
  // This is the reported failure case: every lifetime here used to open a
  // phantom string that swallowed the rest of the function.
  const src = "fn f<'a>(x: &'a str) -> &'a str { if x.len() > 0 { return x; } x }";
  assert.equal(strip(src, "rs").code, src);
});

test("a rust plain char literal is blanked", () => {
  // "let c = " is 8 chars, untouched. 'x' is 3 chars: ' x ', blanked.
  // ";" is untouched.
  const src = "let c = 'x';";
  const expected = "let c = " + " ".repeat(3) + ";";
  assert.equal(strip(src, "rs").code, expected);
});

test("a rust escaped char literal is blanked, including an escaped quote", () => {
  const APOS = "'";
  const BACKSLASH = "\\";
  // First literal: ' \ n ' - 4 chars, blanked.
  // Second literal: ' \ ' ' - 4 chars, blanked. The escaped quote inside
  // does not close the literal early.
  const src =
    "let c = " +
    APOS +
    BACKSLASH +
    "n" +
    APOS +
    ";\n" +
    "let q = " +
    APOS +
    BACKSLASH +
    APOS +
    APOS +
    ";";
  const expected = "let c = " + " ".repeat(4) + ";\n" + "let q = " + " ".repeat(4) + ";";
  assert.equal(strip(src, "rs").code, expected);
});

test("a rust unicode escape char literal is blanked", () => {
  const APOS = "'";
  const BACKSLASH = "\\";
  // The literal ' \ u { 1 F 6 0 0 } ' is 11 chars, all blanked.
  const src = "let c = " + APOS + BACKSLASH + "u{1F600}" + APOS + ";";
  const expected = "let c = " + " ".repeat(11) + ";";
  assert.equal(strip(src, "rs").code, expected);
});

test("a rust raw string still blanks correctly alongside lifetimes", () => {
  const prefix = "fn f<'a>(x: &'a str) { let s = ";
  const rawSpan = 'r#' + '"' + "hi" + '"' + "#";
  const suffix = "; }";
  const src = prefix + rawSpan + suffix;
  const expected = prefix + " ".repeat(rawSpan.length) + suffix;
  assert.equal(strip(src, "rs").code, expected);
});

test("a c# three-quote raw string containing braces and quotes is blanked whole", () => {
  // This is the reported failure case: the brace inside the literal used to
  // reach downstream brace matchers because the literal was misread as an
  // empty string followed by loose code.
  // "let j = " is 8 chars, untouched.
  // The raw string `"""{ "a": 1 }"""` is 16 chars, all blanked.
  // ";" is untouched.
  const rawSpan = '"""{ "a": 1 }"""';
  const src = "let j = " + rawSpan + ";";
  const expected = "let j = " + " ".repeat(rawSpan.length) + ";";
  assert.equal(strip(src, "cs").code, expected);
});

test("a c# five-quote raw string containing a three-quote run is blanked whole", () => {
  // The opener is 5 quotes. A 3-quote run inside the content is shorter
  // than the opener, so it is literal text, not a closer. The literal ends
  // only at the first run of 5 or more quotes.
  const rawSpan = '""""" abc """ def """""';
  const src = "let j = " + rawSpan + ";";
  const expected = "let j = " + " ".repeat(rawSpan.length) + ";";
  assert.equal(strip(src, "cs").code, expected);
});

test("a multi-line c# raw string keeps line numbers correct afterward", () => {
  // The raw string spans three lines: `"""`, "line one", "line two", `"""`.
  // Each newline inside it is preserved, every other char is blanked.
  // Line 1: "let j = \"\"\"". Line 2: "line one". Line 3: "line two".
  // Line 4: the closing """ plus ";". Line 5: the "// after" comment.
  const blankedRaw =
    " ".repeat(3) + "\n" + " ".repeat(8) + "\n" + " ".repeat(8) + "\n" + " ".repeat(3);
  const src = 'let j = """\nline one\nline two\n""";\n// after\n';
  const expected = "let j = " + blankedRaw + ";\n" + " ".repeat(8) + "\n";
  const { code, comments } = strip(src, "cs");
  assert.equal(code, expected);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].line, 5);
});

test("a c# double-dollar interpolated raw string with a literal single brace is blanked whole", () => {
  // Two dollar signs mean an interpolation needs two consecutive braces to
  // open. A single `{` here is just literal content, not code, and the
  // whole span - dollars, quotes, and content - is blanked, matching how
  // the plain verbatim form already behaves.
  const rawSpan = '$$"""{ single brace }"""';
  const src = "let j = " + rawSpan + ";";
  const expected = "let j = " + " ".repeat(rawSpan.length) + ";";
  assert.equal(strip(src, "cs").code, expected);
});

// The tests below cover strip's third return value: `interpolations`, the
// identifiers read out of a Rust format capture or a C# interpolated
// string. The capture content is blanked out of `code` exactly like the
// rest of the string - these tests only check the side channel, not `code`.

test("a rust named format capture yields its identifier, with the capture's own line", () => {
  const src = 'let msg = format!("{count} items");';
  const { interpolations } = strip(src, "rs");
  assert.deepEqual(interpolations, [{ name: "count", line: 1 }]);
});

test("a rust positional format capture contributes no identifier", () => {
  // `total` is a real macro argument, visible in the code stream outside
  // the string, so it needs no help from strip. The capture itself, `{}`,
  // names nothing: there is no identifier text between the braces.
  const src = 'let msg = format!("{}", total);';
  const { interpolations } = strip(src, "rs");
  assert.deepEqual(interpolations, []);
});

test("a rust format specifier is dropped, not read as an identifier", () => {
  // `{ptr:p}` reads the binding `ptr`. `p` is a pointer-format specifier
  // after the colon, not a second identifier.
  const src = 'let msg = format!("{ptr:p}");';
  const { interpolations } = strip(src, "rs");
  assert.deepEqual(interpolations, [{ name: "ptr", line: 1 }]);
});

test("a rust escaped double brace is not read as an interpolation", () => {
  // `{{` and `}}` are Rust's own escape for a literal brace. This string
  // has no capture at all, only the literal text "{count} items".
  const src = 'let msg = format!("{{count}} items");';
  const { interpolations } = strip(src, "rs");
  assert.deepEqual(interpolations, []);
});

test("a c# interpolated string yields every identifier it reads", () => {
  const src = 'var s = $"hello {who} from {_name}";';
  const { interpolations } = strip(src, "cs");
  assert.deepEqual(interpolations, [
    { name: "who", line: 1 },
    { name: "_name", line: 1 },
  ]);
});
