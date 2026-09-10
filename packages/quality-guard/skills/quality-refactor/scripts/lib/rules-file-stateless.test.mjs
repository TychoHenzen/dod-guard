import assert from "node:assert/strict";
import { test } from "node:test";
import { statelessViolations } from "./rules-file-fixtures.test.mjs";

test("a Rust method that reads a field through self is not stateless", () => {
  const code = [
    "struct Widget { factor: f64 }",
    "impl Widget {",
    "    fn scaled(&self, x: f64) -> f64 { x * self.factor }",
    "}",
  ].join("\n");
  assert.deepEqual(statelessViolations(code), []);
});

test("a Rust method that touches nothing is stateless", () => {
  const code = [
    "struct Widget { factor: f64 }",
    'impl Widget { fn greet(&self) -> String { "hi".to_string() } }',
  ].join("\n");
  const violations = statelessViolations(code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /greet/);
});

test("an associated function without self is judged by the same rule", () => {
  const code = [
    "struct Widget { factor: f64 }",
    'impl Widget { fn describe() -> String { "just a widget".to_string() } }',
  ].join("\n");
  const violations = statelessViolations(code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /describe/);
});

test("a trait impl's methods are inside a span", () => {
  const code = [
    "struct Counter { count: u32 }",
    "trait Describable { fn describe(&self) -> String; }",
    "impl Describable for Counter { fn describe(&self) -> String { " +
      '"a counter".to_string() } }',
  ].join("\n");
  const violations = statelessViolations(code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /describe/);
});

test("a trait impl method that touches self is not stateless", () => {
  const code = [
    "struct Counter { count: u32 }",
    "trait Incrementable { fn increment(&mut self); }",
    "impl Incrementable for Counter { fn increment(&mut self) { " +
      "self.count += 1; } }",
  ].join("\n");
  assert.deepEqual(statelessViolations(code), []);
});
