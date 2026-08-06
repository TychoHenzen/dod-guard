// Characterization tests for rules-file.mjs, on the Rust impl-block span
// fix. Methods live in a separate `impl` block from the struct that owns
// their fields. So classSpans has to stitch the two back together before
// stateless-method can say anything about a Rust method.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConfig } from "./config.mjs";
import { scanFile } from "./rules-file.mjs";

function rustFile(rel, code) {
  return { rel, lang: "rs", isTest: false, source: code, lines: code.split("\n") };
}

function csFile(rel, code) {
  return { rel, lang: "cs", isTest: false, source: code, lines: code.split("\n") };
}

function statelessViolations(code) {
  const config = buildConfig("default");
  const { violations } = scanFile(rustFile("src/lib.rs", code), config);
  return violations.filter((v) => v.rule === "stateless-method");
}

/**
 * The complexity metric only ever surfaces as a violation. The default
 * thresholds, warn 5 and error 10, swallow anything low enough to be worth
 * pinning exactly. Forcing both bounds to 0 makes every function's
 * complexity - even a trivial 1 - cross the error line, so its `metric`
 * field always carries the real number.
 */
function complexityFor(code) {
  const config = buildConfig("default");
  config.thresholds = { ...config.thresholds, complexity: { warn: 0, error: 0 } };
  const { violations } = scanFile(rustFile("src/lib.rs", code), config);
  const complexity = violations.find((v) => v.rule === "complexity");
  return complexity.metric;
}

test("a Rust method that reads a field through self is not reported as stateless", () => {
  const code = `
struct Widget {
    factor: f64,
}

impl Widget {
    fn scaled(&self, x: f64) -> f64 {
        x * self.factor
    }
}
`;
  assert.deepEqual(statelessViolations(code), []);
});

test("a Rust method that touches nothing is reported as stateless", () => {
  const code = `
struct Widget {
    factor: f64,
}

impl Widget {
    fn greet(&self) -> String {
        "hi".to_string()
    }
}
`;
  const violations = statelessViolations(code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /greet/);
});

test("a Rust associated function with no self parameter is judged on the same rule as any other", () => {
  const code = `
struct Widget {
    factor: f64,
}

impl Widget {
    fn describe() -> String {
        "just a widget".to_string()
    }
}
`;
  const violations = statelessViolations(code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /describe/);
});

test("a trait impl's methods are inside a span", () => {
  const code = `
struct Counter {
    count: u32,
}

trait Describable {
    fn describe(&self) -> String;
}

impl Describable for Counter {
    fn describe(&self) -> String {
        "a counter".to_string()
    }
}
`;
  // Before the fix, enclosingClass never found a span for a trait-impl
  // method. So checkStatelessMethod returned early and reported nothing
  // here. That false negative looked exactly like "no violations".
  // Finding the violation is what proves the method is now inside a span.
  const violations = statelessViolations(code);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /describe/);
});

test("a trait impl method that touches state through self is not reported as stateless", () => {
  const code = `
struct Counter {
    count: u32,
}

trait Incrementable {
    fn increment(&mut self);
}

impl Incrementable for Counter {
    fn increment(&mut self) {
        self.count += 1;
    }
}
`;
  assert.deepEqual(statelessViolations(code), []);
});

test("a struct plus its impl block still count as one type in the file", () => {
  const code = `
struct Widget {
    factor: f64,
}

impl Widget {
    fn scaled(&self, x: f64) -> f64 {
        x * self.factor
    }
}
`;
  const config = buildConfig("default");
  const { types, violations } = scanFile(rustFile("src/lib.rs", code), config);
  assert.equal(types.length, 1);
  assert.equal(
    violations.some((v) => v.rule === "types-per-file"),
    false,
  );
});

test("a four-arm match scores four decision points plus the base of one, not five", () => {
  const code = `
fn categorize(x: i32) -> &'static str {
    match x {
        0 => "zero",
        1 => "one",
        2 => "two",
        _ => "other",
    }
}
`;
  // Before the fix this scored 6: 1 base, +1 for the bare \`match\` keyword,
  // +4 for the arrows. The keyword add-on double-counted a branch already
  // captured by the arms themselves.
  assert.equal(complexityFor(code), 5);
});

test("a function whose only pipe pair is a closure's empty parameter list is not charged for it", () => {
  const code = `
fn run() -> i32 {
    let f = || 42;
    f()
}
`;
  // \`||\` here is a zero-argument closure, not boolean-or. Before the fix
  // the common set's bare \`\\|\\|\` pattern could not tell the two apart and
  // charged this as a branch, scoring 2 instead of 1.
  assert.equal(complexityFor(code), 1);
});

test("a genuine boolean or is still charged as a branch", () => {
  const code = `
fn is_valid(a: bool, b: bool) -> bool {
    a || b
}
`;
  assert.equal(complexityFor(code), 2);
});

test("if let is charged once, as the branch it is", () => {
  const code = `
fn describe(x: Option<i32>) -> &'static str {
    if let Some(_) = x {
        "some"
    } else {
        "none"
    }
}
`;
  // \`if let\` starts with the \`if\` keyword the common pattern set already
  // matches, so it needs no Rust-specific pattern of its own.
  assert.equal(complexityFor(code), 2);
});

test("a Rust method whose header lookback crosses a neighboring &'static lifetime is not exempted from stateless-method", () => {
  const code = `
struct Widget {
    factor: f64,
}

impl Widget {
    fn label(&self) -> &'static str { "widget" }
    fn greet(&self) -> String { "hi".to_string() }
}
`;
  // Before the fix, isStatic's \\b(static|const)\\b regex matched the
  // "static" inside label's "&'static" return type, which falls in
  // greet's 60-character lookback window. That silently exempted greet
  // from stateless-method even though it has no static/const modifier of
  // its own.
  const violations = statelessViolations(code);
  assert.ok(
    violations.some((v) => /greet/.test(v.message)),
    "greet should be reported as stateless, not exempted by the neighboring lifetime",
  );
});

test("an oversized function inside a #[cfg(test)] module raises no per-file violation", () => {
  const body = Array.from({ length: 35 }, (_, i) => `        let v${i} = ${i};`).join("\n");
  const code = `
pub fn tally(items: &[u32]) -> u32 {
    items.iter().sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
${body}
        assert_eq!(tally(&[]), 0);
    }
}
`;
  const config = buildConfig("default");
  const { violations } = scanFile(rustFile("src/lib.rs", code), config);
  // Before the fix, the mod's body read as production code. it_works() was
  // oversized, which function-length reported. Nothing else in the file
  // calls it, so unused-local reported it as dead too.
  assert.equal(
    violations.some((v) => v.message.includes("it_works")),
    false,
  );
});

// The tests below cover the interpolation fix. A name may be read only
// inside a blanked Rust format capture, or a blanked C# interpolated
// string. It still has to count as a real reference. It must not disappear
// along with the string it sits in.

test("a Rust free function read only by an inline format capture is not reported as unused-local", () => {
  const code = `
fn greeting() -> &'static str {
    "hi"
}

fn show() {
    println!("{greeting}");
}
`;
  const config = buildConfig("default");
  const { violations } = scanFile(rustFile("src/lib.rs", code), config);
  // Before the fix, \`greeting\` never appeared in the stripped code stream
  // at all. The capture that reads it sits inside a blanked string literal.
  // So checkUnusedLocal saw only its own declaration, and called it dead.
  assert.equal(
    violations.some((v) => v.rule === "unused-local" && v.message.includes("greeting")),
    false,
  );
});

test("a C# method that reads a field only through an interpolated string is not reported as stateless", () => {
  const code = `
public class Thing
{
    private readonly string _name;
    public Thing(string name) { _name = name; }
    public string Greet(string who) => $"hello {who} from {_name}";
}
`;
  const config = buildConfig("default");
  const { violations } = scanFile(csFile("src/Thing.cs", code), config);
  // Before the fix, \`_name\` only ever appeared inside the interpolated
  // string, which strip blanks whole - touchesState never saw it, and
  // Greet() was reported as never touching instance state.
  assert.deepEqual(
    violations.filter((v) => v.rule === "stateless-method"),
    [],
  );
});
