import assert from "node:assert/strict";
import { test } from "node:test";
import { lineIndex } from "./offsets.mjs";
import { findFunctions } from "./parse.mjs";
import { strip } from "./strip.mjs";

function namesIn(source, lang) {
  const { code } = strip(source, lang);
  return findFunctions(code, lang, lineIndex(code))
    .map((fn) => fn.name)
    .sort();
}

test("Rust if conditions do not create phantom definitions", () => {
  const src = [
    "fn caller() {",
    "    if path.exists() { do_thing(); }",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("Rust while-let calls do not create phantom definitions", () => {
  const src = [
    "fn caller() {",
    "    while let Some(item) = iter.next() { use_item(item); }",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("Rust for iterator calls do not create phantom definitions", () => {
  const src = [
    "fn caller() {",
    "    for entry in read_dir().flatten() { touch(entry); }",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("Rust match calls do not create phantom definitions", () => {
  const src = [
    "fn caller() {",
    "    match parse_input() { Some(v) => use_value(v), None => {} }",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("a plain Rust fn is a definition", () => {
  const src = ["fn add(a: i32, b: i32) -> i32 {", "    a + b", "}"].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["add"]);
});
