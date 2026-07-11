import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkAvoidableElse,
  checkCyclomaticComplexity,
  checkUnnecessaryElse,
  findBlockEnd,
  findCsFunctions,
  findFunctions,
  findJsFunctions,
  findPyBlockEnd,
  findPyFunctions,
  findRsFunctions,
} from "./find-functions.js";

// ── findBlockEnd ────────────────────────────────────────────────────────

describe("findBlockEnd", () => {
  it("finds matching closing brace for simple block", () => {
    const lines = ["function foo() {", "  const x = 1;", "  return x;", "}"];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 3);
  });

  it("handles nested braces correctly", () => {
    const lines = ["function foo() {", "  if (x) {", "    return 1;", "  }", "  return 0;", "}"];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 5);
  });

  it("ignores braces inside string literals", () => {
    const lines = [
      "function foo() {",
      "  const s = '{ not a brace }';",
      '  const t = "{ also not }";',
      "  return s + t;",
      "}",
    ];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 4);
  });

  it("ignores braces inside template literals", () => {
    const lines = ["function foo() {", "  const s = `{ also not a real brace }`;", "  return s;", "}"];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 3);
  });

  it("ignores braces after single-line comment", () => {
    const lines = ["function foo() {", "  // this is a comment with { braces }", "  return 1;", "}"];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 3);
  });

  it("handles open brace on same line as close brace", () => {
    const lines = ["function foo() { return {}; }"];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 0);
  });

  it("returns last line when no closing brace found", () => {
    const lines = ["function foo() {", "  const x = 1;", "  // missing closing brace"];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 2);
  });

  it("handles escaped quote in string", () => {
    const lines = ["function foo() {", "  const s = 'it\\'s a string with { brace }';", "  return s;", "}"];
    assert.equal(findBlockEnd(lines, 0, "{", "}"), 3);
  });
});

// ── findJsFunctions ─────────────────────────────────────────────────────

describe("findJsFunctions", () => {
  it("detects named function declarations", () => {
    const lines = ["function hello() {", "  return 'world';", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "hello");
    assert.equal(result[0].startLine, 1);
    assert.equal(result[0].endLine, 3);
  });

  it("detects async function declarations", () => {
    const lines = ["async function fetchData() {", "  return await db.query();", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "fetchData");
  });

  it("detects exported functions", () => {
    const lines = ["export function doThing() {", "  return 42;", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "doThing");
  });

  it("detects export default function", () => {
    const lines = ["export default function main() {", "  return 'default';", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "main");
  });

  it("detects method-style functions (name(){})", () => {
    const lines = ["class Foo {", "  bar() {", "    return 1;", "  }", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "bar");
  });

  it("detects static methods", () => {
    const lines = ["class Foo {", "  static create() {", "    return new Foo();", "  }", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "create");
  });

  it("detects getter methods", () => {
    const lines = ["class Foo {", "  get value() {", "    return this._value;", "  }", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "value");
  });

  it("detects setter methods", () => {
    const lines = ["class Foo {", "  set value(v) {", "    this._value = v;", "  }", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "value");
  });

  it("detects arrow function assigned to const", () => {
    const lines = ["const add = (a, b) => {", "  return a + b;", "};"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "add");
  });

  it("detects exported arrow function", () => {
    const lines = ["export const multiply = (a, b) => {", "  return a * b;", "};"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "multiply");
  });

  it("detects function expression assigned to variable", () => {
    const lines = ["const greet = function(name) {", "  return 'hello ' + name;", "};"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "greet");
  });

  it("skips control keywords (if, for, while, etc.) in method position", () => {
    const lines = ["if (x) {", "  return x;", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 0);
  });

  it("detects multiple functions in a file", () => {
    const lines = ["function first() {", "  return 1;", "}", "", "function second() {", "  return 2;", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "first");
    assert.equal(result[1].name, "second");
  });

  it("handles nested functions (only detects top-level)", () => {
    const lines = ["function outer() {", "  function inner() {", "    return 1;", "  }", "  return inner();", "}"];
    const result = findJsFunctions(lines);
    // outer is found, inner is skipped because i jumps to end of outer
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "outer");
  });

  it("handles async arrow function", () => {
    const lines = ["const fetch = async (url) => {", "  const r = await get(url);", "  return r.json();", "};"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "fetch");
  });

  it("handles async method", () => {
    const lines = ["class Service {", "  async fetch(url) {", "    return await get(url);", "  }", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "fetch");
  });

  it("skips comment-only and blank lines", () => {
    const lines = [
      "// This is a comment",
      "",
      "// Another comment",
      "/* block comment */",
      "function real() {",
      "  return 1;",
      "}",
    ];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "real");
  });

  it("returns bodyLines correctly", () => {
    const lines = ["function calc() {", "  const x = 1;", "  const y = 2;", "  return x + y;", "}"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].bodyLines, ["  const x = 1;", "  const y = 2;", "  return x + y;"]);
  });

  it("detects let and var arrow functions too", () => {
    const lines = ["let fn1 = () => { return 1; };", "var fn2 = () => { return 2; };"];
    const result = findJsFunctions(lines);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "fn1");
    assert.equal(result[1].name, "fn2");
  });
});

// ── findPyFunctions ─────────────────────────────────────────────────────

describe("findPyFunctions", () => {
  it("detects simple def function", () => {
    const lines = ["def hello():", "    return 'world'"];
    const result = findPyFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "hello");
    assert.equal(result[0].startLine, 1);
  });

  it("does not currently detect async def (known gap — regex only matches 'def')", () => {
    const lines = ["async def fetch():", "    return await db.query()"];
    // The current regex /^\s*def\s+(\w+)\s*\(/ does not match async def.
    // This test documents the gap.
    const result = findPyFunctions(lines);
    assert.equal(result.length, 0);
  });

  it("detects multiple functions", () => {
    const lines = ["def first():", "    return 1", "", "def second():", "    return 2"];
    const result = findPyFunctions(lines);
    assert.equal(result.length, 2);
  });

  it("handles indented functions inside class", () => {
    const lines = [
      "class Foo:",
      "    def method(self):",
      "        return 1",
      "",
      "    def another(self):",
      "        return 2",
    ];
    const result = findPyFunctions(lines);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "method");
  });

  it("handles nested functions", () => {
    const lines = ["def outer():", "    def inner():", "        return 5", "    return inner()"];
    const result = findPyFunctions(lines);
    // findPyBlockEnd for outer goes to end of file, so inner is skipped by `i = end`
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "outer");
  });
});

// ── findPyBlockEnd ──────────────────────────────────────────────────────

describe("findPyBlockEnd", () => {
  it("finds end of simple indented block", () => {
    const lines = ["def foo():", "    line1", "    line2", "", "top_level"];
    assert.equal(findPyBlockEnd(lines, 0), 3);
  });

  it("handles block with no following content (end of file)", () => {
    const lines = ["def foo():", "    line1", "    line2"];
    assert.equal(findPyBlockEnd(lines, 0), 2);
  });

  it("handles empty lines in body", () => {
    const lines = ["def foo():", "    line1", "", "    line2", "", "next_def():"];
    assert.equal(findPyBlockEnd(lines, 0), 4);
  });

  it("handles deeper indentation (nested blocks)", () => {
    const lines = ["def foo():", "    if x:", "        do_thing()", "    return True", "", "top_level"];
    const result = findPyBlockEnd(lines, 0);
    // The top_level line at index 5 has indent <= base (0 <= 0) at line 6
    // Wait, base indent of "def foo():" is 0. Lines at same indent after the block
    // end the block. "top_level" at index 5 has indent 0 → return 5-1 = 4
    assert.equal(result, 4);
  });
});

// ── findRsFunctions ─────────────────────────────────────────────────────

describe("findRsFunctions", () => {
  it("detects simple fn", () => {
    const lines = ["fn hello() {", "    42", "}"];
    const result = findRsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "hello");
  });

  it("detects pub fn", () => {
    const lines = ["pub fn public_fn() {", '    println!("hi");', "}"];
    const result = findRsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "public_fn");
  });

  it("detects pub(crate) fn", () => {
    const lines = ["pub(crate) fn internal() {", "    1", "}"];
    const result = findRsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "internal");
  });

  it("detects async fn", () => {
    const lines = ["async fn fetch() {", '    reqwest::get("/").await', "}"];
    const result = findRsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "fetch");
  });

  it("detects unsafe fn", () => {
    const lines = ["unsafe fn raw_ptr() {", "    *ptr", "}"];
    const result = findRsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "raw_ptr");
  });

  it("detects pub async unsafe fn", () => {
    const lines = ["pub async unsafe fn complex() {", "    42", "}"];
    const result = findRsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "complex");
  });

  it("does not match fn inside string or comment context", () => {
    const lines = ["// fn not_a_fn() {", "fn real_fn() {", "    1", "}"];
    const result = findRsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "real_fn");
  });
});

// ── findCsFunctions ─────────────────────────────────────────────────────

describe("findCsFunctions", () => {
  it("detects public method", () => {
    const lines = ["public int GetValue() {", "    return _value;", "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "GetValue");
  });

  it("detects private async method", () => {
    const lines = ["private async Task<string> FetchAsync() {", '    return await client.GetStringAsync("/");', "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "FetchAsync");
  });

  it("detects static method with multiple modifiers", () => {
    const lines = ["public static async Task Run() {", "    await Task.Delay(1);", "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Run");
  });

  it("detects generic method (non-generic return type, generic on method name is not supported)", () => {
    // The regex (\w+) only matches word chars for method name — Get<T> stops at <.
    // This test documents the gap: generic type params on method name are not detected.
    const lines = ["public T GetById<T>(int id) where T : class {", "    return default;", "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 0);
  });

  it("detects method with generic return type (no generic on method name)", () => {
    const lines = ["public Task<string> FetchAsync() {", '    return Task.FromResult("ok");', "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "FetchAsync");
  });

  it("skips control keywords used as method names (if, for, etc.)", () => {
    // "if" is in CONTROL_KEYWORDS, so `int if()...` should not be detected
    const lines = ["public int if() {", "    return 0;", "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 0);
  });

  it("skips lines starting with attribute brackets", () => {
    const lines = ["[HttpGet]", "public IActionResult Index() {", "    return View();", "}"];
    const result = findCsFunctions(lines);
    // Line 0 starts with '[' → skipped. Line 1 matches.
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Index");
  });

  it("skips comment lines and blank lines", () => {
    const lines = ["// This is a C# method comment", "", "public void DoWork() {", "    work();", "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "DoWork");
  });

  it("handles void return type", () => {
    const lines = ["void DoThing() {", "    // no return", "}"];
    const result = findCsFunctions(lines);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "DoThing");
  });
});

// ── findFunctions dispatcher ────────────────────────────────────────────

describe("findFunctions dispatcher", () => {
  it("dispatches to js finder for 'js' language", () => {
    const lines = ["function foo() {", "  return 1;", "}"];
    const result = findFunctions(lines, "js");
    assert.equal(result.length, 1);
  });

  it("dispatches to python finder for 'py' language", () => {
    const lines = ["def foo():", "    return 1"];
    const result = findFunctions(lines, "py");
    assert.equal(result.length, 1);
  });

  it("dispatches to rust finder for 'rs' language", () => {
    const lines = ["fn foo() {", "    1", "}"];
    const result = findFunctions(lines, "rs");
    assert.equal(result.length, 1);
  });

  it("dispatches to csharp finder for 'cs' language", () => {
    const lines = ["public void Foo() {", "    Bar();", "}"];
    const result = findFunctions(lines, "cs");
    assert.equal(result.length, 1);
  });

  it("returns empty array for null language", () => {
    const lines = ["def foo():", "    return 1"];
    const result = findFunctions(lines, null);
    assert.deepEqual(result, []);
  });

  it("returns empty array for unsupported language", () => {
    const lines = ["func foo() {"];
    // @ts-expect-error — testing unsupported language
    const result = findFunctions(lines, "go");
    assert.deepEqual(result, []);
  });
});

// ── checkCyclomaticComplexity ───────────────────────────────────────────

describe("checkCyclomaticComplexity", () => {
  it("returns base complexity of 1 for empty body", () => {
    assert.deepEqual(checkCyclomaticComplexity([], "js"), { complexity: 1 });
  });

  it("returns 0 for null language", () => {
    assert.deepEqual(checkCyclomaticComplexity(["if (x) { return 1; }"], null), {
      complexity: 0,
    });
  });

  it("returns 0 for unknown language", () => {
    // @ts-expect-error — testing unknown language
    assert.deepEqual(checkCyclomaticComplexity(["if true:"], "rb"), {
      complexity: 0,
    });
  });

  it("counts if statements in JS", () => {
    const body = ["if (a) { doA(); }", "if (b) { doB(); }"];
    const result = checkCyclomaticComplexity(body, "js");
    assert.equal(result.complexity, 3); // 1 base + 2 ifs
  });

  it("counts for/while/do loops in JS (do-while double-counts due to while keyword)", () => {
    const body = [
      "for (let i = 0; i < 10; i++) { sum += i; }",
      "while (q.length) { q.pop(); }",
      "do { x--; } while (x > 0);",
    ];
    const result = checkCyclomaticComplexity(body, "js");
    // 1 base + for + while + do + while (in do-while) = 5
    // The `while` in do-while also matches the while pattern — known double-count.
    assert.equal(result.complexity, 5);
  });

  it("counts case/catch in JS", () => {
    const body = [
      "switch (x) {",
      "  case 1: return 'one';",
      "  case 2: return 'two';",
      "  default: return 'other';",
      "}",
    ];
    const result = checkCyclomaticComplexity(body, "js");
    // 1 base + 2 case + 0 catch
    assert.equal(result.complexity, 3);
  });

  it("counts logical operators in JS", () => {
    const body = ["if (a && b) { return 1; }", "const x = c || d || e;", "const y = f ?? g;", "const z = h ? 1 : 2;"];
    const result = checkCyclomaticComplexity(body, "js");
    // 1 base + if + && + || (2 occurrences) + ?? + ?. + ?: (counts as one per ternary)
    assert.ok(result.complexity > 1, "complexity should be > 1 for logical operators");
  });

  it("removes strings and comments before counting", () => {
    const body = [
      'const msg = "if this were real code";', // if inside string should not count
      "return msg;",
    ];
    const result = checkCyclomaticComplexity(body, "js");
    assert.equal(result.complexity, 1); // only base
  });

  it("counts Python decision points", () => {
    const body = [
      "if condition:",
      "    return 1",
      "elif other:",
      "    return 2",
      "for item in items:",
      "    process(item)",
    ];
    const result = checkCyclomaticComplexity(body, "py");
    // 1 base + if + elif + for = 4
    assert.equal(result.complexity, 4);
  });

  it("counts Python except (only matches bare except:, not except ValueError:)", () => {
    // The regex /\bexcept\s*:/g matches `except :` (bare except with colon)
    // but NOT `except ValueError:` (specific exception type).
    // This test documents the actual behavior.
    const body = [
      "try:",
      "    risky()",
      "except ValueError:", // NOT matched — ValueError between except and colon
      "    handle()",
    ];
    const result = checkCyclomaticComplexity(body, "py");
    assert.equal(result.complexity, 1); // base only — except ValueError: not counted
  });
});

// ── checkUnnecessaryElse ────────────────────────────────────────────────

describe("checkUnnecessaryElse", () => {
  it("returns 0 for null language", () => {
    assert.deepEqual(checkUnnecessaryElse([], null), { count: 0 });
  });

  it("returns 0 for unknown language", () => {
    // @ts-expect-error — testing unknown language
    assert.deepEqual(checkUnnecessaryElse([], "rb"), { count: 0 });
  });

  it("detects unnecessary else after return in JS", () => {
    const body = ["if (x) {", "  return 1;", "} else {", "  return 2;", "}"];
    const result = checkUnnecessaryElse(body, "js");
    assert.equal(result.count, 1);
  });

  it("detects unnecessary else after throw", () => {
    const body = ["if (!x) {", "  throw new Error('missing');", "} else {", "  return x;", "}"];
    const result = checkUnnecessaryElse(body, "js");
    assert.equal(result.count, 1);
  });

  it("detects unnecessary else after break in loop", () => {
    const body = [
      "for (const item of items) {",
      "  if (item === target) {",
      "    break;",
      "  } else {",
      "    process(item);",
      "  }",
      "}",
    ];
    const result = checkUnnecessaryElse(body, "js");
    // The "break" inside if-body triggers unnecessary else
    assert.equal(result.count, 1);
  });

  it("does not flag else when if-block does not exit", () => {
    const body = ["if (x) {", "  console.log(x);", "} else {", "  console.log('no x');", "}"];
    const result = checkUnnecessaryElse(body, "js");
    assert.equal(result.count, 0);
  });

  it("does not flag else when if-block has nested jump that is not the last line", () => {
    const body = [
      "if (x) {",
      "  if (y) { return; }",
      "  console.log('still here');", // NOT a jump
      "} else {",
      "  console.log('no');",
      "}",
    ];
    const result = checkUnnecessaryElse(body, "js");
    // Last line of if-body (after skipping nested blocks) is console.log — no jump
    assert.equal(result.count, 0);
  });

  it("detects unnecessary else in Python after return/raise", () => {
    const body = ["if condition:", "    return value", "else:", "    return other"];
    const result = checkUnnecessaryElse(body, "py");
    assert.equal(result.count, 1);
  });

  it("detects unnecessary elif in Python", () => {
    const body = ["if x == 1:", "    return 'one'", "elif x == 2:", "    return 'two'"];
    const result = checkUnnecessaryElse(body, "py");
    assert.equal(result.count, 1);
  });
});

// ── checkAvoidableElse ──────────────────────────────────────────────────

describe("checkAvoidableElse", () => {
  it("returns 0 for null language", () => {
    assert.deepEqual(checkAvoidableElse([], null), { count: 0 });
  });

  it("returns 0 for unknown language", () => {
    // @ts-expect-error — testing unknown language
    assert.deepEqual(checkAvoidableElse([], "rb"), { count: 0 });
  });

  it("returns 0 when function already uses guard clauses", () => {
    const body = [
      "if (!x) {",
      "  return null;",
      "}",
      "if (x > 100) {",
      "  console.log(x);",
      "} else {",
      "  console.log('small');",
      "}",
    ];
    const result = checkAvoidableElse(body, "js");
    // First if-block has return without else → guard clause detected
    assert.equal(result.count, 0);
  });

  it("counts if/else pairs when no guard clauses exist", () => {
    const body = ["if (x > 0) {", "  console.log('positive');", "} else {", "  console.log('non-positive');", "}"];
    const result = checkAvoidableElse(body, "js");
    // No guard clauses → count = 1
    assert.equal(result.count, 1);
  });

  it("counts multiple else patterns when no guard clauses", () => {
    const body = ["if (a) {", "  doA();", "} else if (b) {", "  doB();", "} else {", "  doDefault();", "}"];
    const result = checkAvoidableElse(body, "js");
    // No guard clauses → count = 2 (one "else if" and one "else")
    assert.equal(result.count, 2);
  });

  it("detects guard clauses in Python", () => {
    const body = ["if not x:", "    return None", "if x > 0:", "    process(x)", "else:", "    skip(x)"];
    const result = checkAvoidableElse(body, "py");
    // First if has return without else → guard clause → count = 0
    assert.equal(result.count, 0);
  });

  it("counts else/elif in Python when no guard clauses", () => {
    const body = ["if x > 0:", "    process(x)", "else:", "    skip(x)"];
    const result = checkAvoidableElse(body, "py");
    assert.equal(result.count, 1);
  });

  it("guard clause check: } else { on same line as if-body end → bug: checks next line for else", () => {
    // When } and else are on the same line (line 2), the guard-clause check looks
    // at bodyLines[blockEnd+1] (line 3: "  return x;") for the else pattern — not
    // the same line where } and else actually live. This is a known gap.
    // Result: the if-block IS detected as a guard clause → count = 0.
    const body = ["if (!x) {", "  return null;", "} else {", "  return x;", "}"];
    const result = checkAvoidableElse(body, "js");
    assert.equal(result.count, 0);
  });
});
