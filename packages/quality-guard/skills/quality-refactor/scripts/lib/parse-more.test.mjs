import assert from "node:assert/strict";
import { test } from "node:test";
import { lineIndex } from "./offsets.mjs";
import { findFunctions } from "./parse.mjs";
import { namesIn } from "./parse-more-support.test.mjs";
import { strip } from "./strip.mjs";

test("pub async Rust functions are definitions", () => {
  const src = [
    "pub async fn fetch(url: String) -> String {",
    "    do_fetch(url).await",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["fetch"]);
});

test("unsafe Rust functions are definitions", () => {
  const src = [
    "unsafe fn raw_write(ptr: *mut u8, value: u8) {",
    "    *ptr = value;",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["raw_write"]);
});

test("Rust impl methods are definitions", () => {
  const src = [
    "impl Widget {",
    "    fn resize(&self, factor: f64) { self.scale(factor); }",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["resize"]);
});

test("Rust receiver forms do not count as parameters", () => {
  const src = [
    "fn a(self, x: i32) -> i32 { x }",
    "fn b(&self, x: i32) -> i32 { x }",
    "fn c(&mut self, x: i32) -> i32 { x }",
    "fn d(mut self, x: i32) -> i32 { x }",
    "fn e(&'a self, x: i32) -> i32 { x }",
  ].join("\n");
  const { code } = strip(src, "rs");
  for (const fn of findFunctions(code, "rs", lineIndex(code))) {
    assert.deepEqual(fn.params, ["x: i32"]);
  }
});

test("Rust closures are not collected", () => {
  const src = [
    "fn caller() {",
    "    let add = |a, b| { a + b };",
    "    add(1, 2);",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});
