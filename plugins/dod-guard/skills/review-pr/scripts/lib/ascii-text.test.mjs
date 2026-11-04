// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { asciiText } from "./ascii-text.mjs";

// Code points rather than literals, so this file stays ASCII after formatting.
const chars = (...codes) => String.fromCodePoint(...codes);

test("maps dashes, quotes, ellipsis and arrows", () => {
  const input = `a${chars(0x2014)}b${chars(0x2013)}c ${chars(0x2018)}x${chars(0x2019)} ${chars(0x201c)}y${chars(0x201d)}${chars(0x2026, 0x2192, 0x2190)}`;
  assert.equal(asciiText(input), "a-b-c 'x' \"y\"...-><-");
});

test("maps no-break space to a space", () => {
  assert.equal(asciiText(`a${chars(0xa0)}b`), "a b");
});

test("escapes other characters with their code point", () => {
  assert.equal(asciiText(chars(0xe9)), "<U+00E9>");
  assert.equal(asciiText(chars(0x1f600)), "<U+1F600>");
});

test("leaves ASCII unchanged", () => {
  assert.equal(asciiText("plain text, 123 -> ok"), "plain text, 123 -> ok");
});
