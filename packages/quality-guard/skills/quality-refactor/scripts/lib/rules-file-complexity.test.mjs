import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import {
  complexityFor,
  rustFile,
  scanViolations,
} from "./rules-file-fixtures.test.mjs";

test("a struct and its impl block count as one type", () => {
  const code =
    "struct Widget { factor: f64 }\n" +
    "impl Widget { fn scaled(&self) -> f64 { self.factor } }";
  const found = scanViolations(rustFile("src/lib.rs", code));
  assert.equal(
    found.filter((violation) => violation.rule === "types-per-file").length,
    0,
  );
});

test("a four-arm match scores four decisions plus the base", () => {
  const code = [
    "fn categorize(x: i32) -> &'static str {",
    '    match x { 0 => "zero", 1 => "one", 2 => "two", _ => "other" }',
    "}",
  ].join("\n");
  assert.equal(complexityFor(code), 5);
});

test("an empty closure parameter list is not boolean-or", () => {
  const code = "fn run() -> i32 { let f = || 42; f() }";
  assert.equal(complexityFor(code), 1);
});

test("a genuine boolean or is a branch", () => {
  const code = "fn is_valid(a: bool, b: bool) -> bool { a || b }";
  assert.equal(complexityFor(code), 2);
});

test("if let is charged once", () => {
  const code =
    "fn describe(x: Option<i32>) -> &'static str { " +
    'if let Some(_) = x { "some" } else { "none" } }';
  assert.equal(complexityFor(code), 2);
});

test(
  "a lifetime in a neighboring method does not exempt a stateless method",
  () => {
  const code = [
    "struct Widget { factor: f64 }",
    "impl Widget {",
    '    fn label(&self) -> &\'static str { "widget" }',
    '    fn greet(&self) -> String { "hi".to_string() }',
    "}",
  ].join("\n");
  const found = scanViolations(rustFile("src/lib.rs", code));
  assert.ok(found.some((violation) => /greet/.test(violation.message)));
});

test(
  "an oversized function inside a test module has no per-file violation",
  () => {
  const body = Array.from(
    { length: 35 },
    (_, i) => "        let v" + i + " = " + i + ";",
  ).join("\n");
  const code = [
    "pub fn tally(items: &[u32]) -> u32 { items.iter().sum() }",
    "#[cfg(test)]",
    "mod tests {",
    "    #[test]",
    "    fn it_works() {",
    body,
    "        assert_eq!(tally(&[]), 0);",
    "    }",
    "}",
  ].join("\n");
  const found = scanViolations(rustFile("src/lib.rs", code));
  assert.equal(
    found.some((violation) => violation.message.includes("it_works")),
    false,
  );
});
