// Characterization tests over the real per-language fixtures in
// ./target/. Every prior defect on this plan shipped for one reason. A
// language branch was written from the shape of TypeScript. Nobody ran it
// against real source in its own language. This file guards against a
// repeat. Each fixture is realistic code, not a snippet list. Each
// assertion is the *exact* set of violations scanFile reports for it. So a
// phantom function, a swallowed body, or a lost reference changes the set
// and fails the test.
//
// Profile: every fixture is scanned under "strict". The (file, line, rule)
// set a fixture produces is the same under "default" and "strict" here,
// checked by hand against this scanner. Collapsing the preferred bound onto
// the hard bound moves the severity label, never the firing point, because
// the new strict error bound equals the old default warn bound. "strict" is
// used anyway, because it raises every presence rule to error. That matches
// a gate run with --fail-on=error, which is the posture a regression corpus
// should assume.
//
// Fixtures live in ./target/ -- a directory named after one of
// config.mjs's IGNORED_DIRS entries on purpose, and each fixture's header
// carries a `quality-guard: off` marker. See target/README.md for why.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConfig } from "./config.mjs";
import { scanFile } from "./rules-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "target");
const STRICT = buildConfig("strict");

function loadFixture(name, lang) {
  const source = readFileSync(join(FIXTURES, name), "utf8");
  return { rel: name, lang, isTest: false, source, lines: source.split(/\r?\n/) };
}

/** The exact (file, line, rule) set a fixture produces, sorted for a stable diff. */
function violationSet(name, lang) {
  const { violations } = scanFile(loadFixture(name, lang), STRICT);
  return violations
    .map((v) => ({ file: v.file, line: v.line, rule: v.rule }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
}

test("Rust fixture (lifetimes, impl blocks, cfg(test), format captures, match arms) reports exactly", () => {
  assert.deepEqual(violationSet("sample.rs", "rs"), [
    { file: "sample.rs", line: 18, rule: "complexity" },
    { file: "sample.rs", line: 29, rule: "stateless-method" },
    { file: "sample.rs", line: 36, rule: "else-branch" },
    { file: "sample.rs", line: 58, rule: "todo-marker" },
  ]);
});

test("Rust fixture's plain-string brace quirk hides phantom() from unused-local, never invents a violation", () => {
  const { violations, interpolations } = scanFile(loadFixture("sample.rs", "rs"), STRICT);
  // notes() (line 51) returns a plain string, "plain { phantom } here",
  // that is not a format!/println! argument. strip.mjs reads every
  // double-quoted Rust string for {identifier} captures regardless, so
  // this string alone makes `phantom` (line 49, never `pub`, never
  // called by name) look referenced. That is deliberate: it can only
  // hide a dead symbol, never invent a violation. Pinned here, not fixed.
  assert.equal(
    interpolations.some((id) => id.name === "phantom"),
    true,
  );
  assert.equal(
    violations.some((v) => v.rule === "unused-local" && v.message.includes("phantom")),
    false,
  );
});

test("C# fixture (raw strings, interpolation, properties, namespace) reports exactly", () => {
  assert.deepEqual(violationSet("Sample.cs", "cs"), [
    { file: "Sample.cs", line: 32, rule: "stateless-method" },
    { file: "Sample.cs", line: 42, rule: "else-branch" },
    { file: "Sample.cs", line: 42, rule: "stateless-method" },
  ]);
});

test("C# fixture's Summarize() correctly stays silent: auto-properties count as fields", () => {
  // Summarize() reads Customer and Total, both auto-implemented properties
  // (`Foo { get; set; }`). CS_PROPERTY_DECL matches that shape, so `fields`
  // carries both names for Invoice and Summarize() is never reported.
  const { violations } = scanFile(loadFixture("Sample.cs", "cs"), STRICT);
  assert.equal(
    violations.some((v) => v.rule === "stateless-method" && v.message.startsWith("Summarize()")),
    false,
  );
});

test("Go fixture (keyword-anchored function detection, receiver, select) reports exactly", () => {
  assert.deepEqual(violationSet("sample.go", "go"), [
    { file: "sample.go", line: 25, rule: "else-branch" },
    { file: "sample.go", line: 37, rule: "todo-marker" },
  ]);
});

test("Java fixture (field, instance method, static method, ternary) reports exactly", () => {
  assert.deepEqual(violationSet("Sample.java", "java"), [
    { file: "Sample.java", line: 26, rule: "else-branch" },
    { file: "Sample.java", line: 26, rule: "stateless-method" },
  ]);
});

test("C++ fixture (access-specifier field, instance method, static method) reports exactly", () => {
  assert.deepEqual(violationSet("sample.cpp", "cpp"), [
    { file: "sample.cpp", line: 28, rule: "else-branch" },
    { file: "sample.cpp", line: 28, rule: "stateless-method" },
  ]);
});

test("C++ fixture's summarize() correctly stays silent: a `private:` section counts as fields", () => {
  // summarize() reads balance, declared under a `private:` access
  // specifier, which is how idiomatic C++ groups fields. CPP_FIELD_DECL
  // matches that shape, so `fields` carries balance for Ledger and
  // summarize() is never reported.
  const { violations } = scanFile(loadFixture("sample.cpp", "cpp"), STRICT);
  assert.equal(
    violations.some((v) => v.rule === "stateless-method" && v.message.startsWith("summarize()")),
    false,
  );
});

test("Python fixture (indentation-based functions, elif/and/or, Tuple hint) reports exactly", () => {
  assert.deepEqual(violationSet("sample.py", "py"), [
    { file: "sample.py", line: 13, rule: "else-branch" },
    { file: "sample.py", line: 23, rule: "unnamed-tuple" },
    { file: "sample.py", line: 27, rule: "todo-marker" },
  ]);
});
