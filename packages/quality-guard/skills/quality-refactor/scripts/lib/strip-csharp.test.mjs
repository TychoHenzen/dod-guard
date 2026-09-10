import assert from "node:assert/strict";
import { test } from "node:test";
import { strip } from "./strip.mjs";

test("a C# three-quote raw string blanks braces and quotes", () => {
  const rawSpan = '"""{ "a": 1 }"""';
  const src = "let j = " + rawSpan + ";";
  assert.equal(
    strip(src, "cs").code,
    "let j = " + " ".repeat(rawSpan.length) + ";",
  );
});

test("a C# five-quote raw string needs a five-quote closer", () => {
  const rawSpan = '""""" abc """ def """""';
  const src = "let j = " + rawSpan + ";";
  assert.equal(
    strip(src, "cs").code,
    "let j = " + " ".repeat(rawSpan.length) + ";",
  );
});

test("a multiline C# raw string preserves line numbers", () => {
  const blankedRaw =
    " ".repeat(3) +
    "\n" +
    " ".repeat(8) +
    "\n" +
    " ".repeat(8) +
    "\n" +
    " ".repeat(3);
  const src = 'let j = """\nline one\nline two\n""";\n// after\n';
  const expected = "let j = " + blankedRaw + ";\n" + " ".repeat(8) + "\n";
  const { code, comments } = strip(src, "cs");
  assert.equal(code, expected);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].line, 5);
});

test("a double-dollar C# raw string with one brace is blanked", () => {
  const rawSpan = '$$"""{ single brace }"""';
  const src = "let j = " + rawSpan + ";";
  assert.equal(
    strip(src, "cs").code,
    "let j = " + " ".repeat(rawSpan.length) + ";",
  );
});
