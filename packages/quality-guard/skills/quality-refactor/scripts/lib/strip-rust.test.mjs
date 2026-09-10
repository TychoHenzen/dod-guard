import assert from "node:assert/strict";
import { test } from "node:test";
import { strip } from "./strip.mjs";

test("Rust lifetimes in generic parameters survive", () => {
  const src = "fn f<'a>(x: i32) -> i32 { x }";
  assert.equal(strip(src, "rs").code, src);
});

test("Rust lifetimes in reference types survive", () => {
  const src = "fn f(x: &'a str) -> &'a str { x }";
  assert.equal(strip(src, "rs").code, src);
});

test("Rust lifetime bounds survive", () => {
  const src = "fn f<'a, 'b>() where 'a: 'b {}";
  assert.equal(strip(src, "rs").code, src);
});

test("a Rust static bound survives", () => {
  const src = "fn f<T: 'static>(x: T) {}";
  assert.equal(strip(src, "rs").code, src);
});

test("a full Rust signature and body with lifetimes survives", () => {
  const src =
    "fn f<'a>(x: &'a str) -> &'a str { if x.len() > 0 { return x; } x }";
  assert.equal(strip(src, "rs").code, src);
});

test("a Rust plain char literal is blanked", () => {
  const src = "let c = 'x';";
  assert.equal(strip(src, "rs").code, "let c = " + " ".repeat(3) + ";");
});

test("a Rust escaped char literal is blanked", () => {
  const src = "let c = '\\n';\nlet q = '\\'';";
  const expected =
    "let c = " + " ".repeat(4) + ";\nlet q = " + " ".repeat(4) + ";";
  assert.equal(strip(src, "rs").code, expected);
});

test("a Rust unicode char literal is blanked", () => {
  const src = "let c = '\\u{1F600}';";
  assert.equal(strip(src, "rs").code, "let c = " + " ".repeat(11) + ";");
});

test("a Rust raw string blanks alongside lifetimes", () => {
  const prefix = "fn f<'a>(x: &'a str) { let s = ";
  const rawSpan = "r#" + '"' + "hi" + '"' + "#";
  const src = prefix + rawSpan + "; }";
  assert.equal(
    strip(src, "rs").code,
    prefix + " ".repeat(rawSpan.length) + "; }",
  );
});
