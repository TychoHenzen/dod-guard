import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { rustFile, tsFile } from "./rules-file-fixtures.test.mjs";
import { scanViolations } from "./rules-file-fixtures.test.mjs";

// Same shape as rustFile and tsFile, with lang "py" (no Python builder exists).
const pyFile = (rel, code) => ({ ...tsFile(rel, code), lang: "py" });
const findings = (file) =>
  scanViolations(file).filter((v) => v.rule === "else-branch");
const summary = (file) =>
  findings(file).map((v) => [v.message.split("(")[0], v.metric]);

// An empty result only means something if the named functions were parsed.
function assertQuiet(file, names) {
  assert.deepEqual(summary(file), []);
  const parsed = scanFile(file, buildConfig()).functions.map((fn) => fn.name);
  const missing = names.filter((n) => !parsed.includes(n));
  assert.deepEqual(missing, []);
}

test("Rust let-else is a guard clause, not an if/else", () => {
  const code =
    "fn g(o: Option<i32>) -> i32 { let Some(v) = o else { return 0; }; v }";
  assertQuiet(rustFile("g.rs", code), ["g"]);
});
test("Rust if/else statements and let initializers count each else", () => {
  const cases = [
    ["fn pick(a: bool) -> i32 { if a { 1 } else { 2 } }", 1],
    ["fn pick(c: bool) -> i32 { let x = if c { 1 } else { 2 }; x }", 1],
    ["fn pick(a: bool, b: bool) { if a {} else if b {} else {} }", 2],
  ];
  for (const [code, metric] of cases) {
    assert.deepEqual(summary(rustFile("p.rs", code)), [["pick", metric]]);
  }
});
test("Python for, while, and try else clauses are not if branches", () => {
  const code = `def first(items):
    for x in items: return x
    else: return None
def drain(queue):
    while queue: queue.pop()
    else: return None
def parse(text):
    try: value = int(text)
    except ValueError: return None
    else: return value
def find(items):
    for x in items:
        if x: break
    else: return None`;
  assertQuiet(pyFile("l.py", code), ["first", "drain", "parse", "find"]);
});
test("Python if/else, elif, multi-line conditions, inline else count", () => {
  const code = `def sign(n):
    if n < 0: return -1
    else: return 1
def grade(score):
    if score > 90: return "A"
    elif score > 80: return "B"
    else: return "C"
def two(a, b):
    if (a and
            b): return 1
    else: return 2
def pick(a, c, b): return a if c else b`;
  const got = summary(pyFile("g.py", code));
  const want = ["sign", "grade", "two", "pick"].map((name) => [name, 1]);
  assert.deepEqual(got, want);
});
test("else words in strings and comments are not tokens", () => {
  const ts = 'function label() {\n  // else\n  /* else */\n  return "else";\n}';
  const py = 'def label():\n    # else\n    return "else"';
  const rs = 'fn label() -> &\'static str {\n    // else\n    "else"\n}';
  assertQuiet(tsFile("label.ts", ts), ["label"]);
  assertQuiet(pyFile("label.py", py), ["label"]);
  assertQuiet(rustFile("label.rs", rs), ["label"]);
});
test("a TypeScript two-way branch reports the reviewed message", () => {
  const code =
    "function pick(v: number): number { if (v > 0) { return 1; } else { return 2; } }";
  assert.deepEqual(findings(tsFile("pick.ts", code)), [
    {
      file: "pick.ts",
      line: 1,
      rule: "else-branch",
      severity: "medium",
      message:
        "pick() has 1 if/else branch(es); review whether a guard clause or polymorphism reads better",
      metric: 1,
      suggestion:
        "Options to review: handle the exceptional case first and return early (Replace Nested Conditional with Guard Clauses), or Replace Conditional with Polymorphism for a type switch. Keep a genuine two-way branch whose outcomes are equally normal.",
    },
  ]);
});
