import assert from "node:assert/strict";
import { test } from "node:test";
import { csFile, scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

// The scanner reports a function from a score of 6, so each body repeats a
// construct often enough to cross that line when the scanner wrongly counts it.
const REPEATS = 6;

function scoresIn(file) {
  return scanViolations(file)
    .filter((violation) => violation.rule === "complexity")
    .map((violation) => violation.metric);
}

function repeat(make) {
  return Array.from({ length: REPEATS }, (_, i) => make(i)).join("\n");
}

const csFn = (body) =>
  csFile(
    "src/Audit.cs",
    `struct Audit\n{\n  string Run()\n  {\n${body}\n  }\n}`,
  );
const tsFn = (body) =>
  tsFile("src/audit.ts", `export function run(a: string) {\n${body}\n}`);

test("a chain of null fallbacks adds no branch in C#", () => {
  const chain = `    return ${"A() ?? ".repeat(REPEATS)}B();`;
  assert.deepEqual(scoresIn(csFn(chain)), []);
});

test("null fallbacks add no branch in TypeScript", () => {
  assert.deepEqual(
    scoresIn(tsFn(repeat((i) => `  const v${i} = a ?? "none";`))),
    [],
  );
});

test("a nullable type suffix adds no branch in C#", () => {
  assert.deepEqual(
    scoresIn(csFn(repeat((i) => `    List<int?> v${i}; int? w${i} = F();`))),
    [],
  );
});

test("a null-coalescing assignment adds no branch in C#", () => {
  assert.deepEqual(scoresIn(csFn(repeat((i) => `    c${i} ??= F();`))), []);
});

test("each C# ternary is one branch", () => {
  const ternaries = repeat((i) => `    var v${i} = ready ? A() : B();`);
  assert.deepEqual(scoresIn(csFn(ternaries)), [REPEATS + 1]);
});

test("each C# ternary split over lines is one branch", () => {
  const ternaries = repeat(
    (i) => `    var v${i} = ready\n      ? A()\n      : B();`,
  );
  assert.deepEqual(scoresIn(csFn(ternaries)), [REPEATS + 1]);
});

test("each TypeScript ternary is one branch", () => {
  const ternaries = repeat((i) => `  const v${i} = a ? "y" : "n";`);
  assert.deepEqual(scoresIn(tsFn(ternaries)), [REPEATS + 1]);
});

test("a TypeScript ternary glued to its condition is one branch", () => {
  const ternaries = repeat((i) => `  const v${i} = a? "y" : "n";`);
  assert.deepEqual(scoresIn(tsFn(ternaries)), [REPEATS + 1]);
});

test("a ternary glued to an index is one branch", () => {
  const ternaries = repeat((i) => `  const v${i} = arr[${i}]? 1 : 2;`);
  assert.deepEqual(scoresIn(tsFn(ternaries)), [REPEATS + 1]);
});

test("a C# ternary glued to a comparison is one branch", () => {
  const ternaries = repeat((i) => `    var v${i} = list.Count>0? 1 : 2;`);
  assert.deepEqual(scoresIn(csFn(ternaries)), [REPEATS + 1]);
});

test("a nullable declaration beside a glued ternary adds one branch", () => {
  const body = repeat((i) => `    int? w${i} = ready? F() : G();`);
  assert.deepEqual(scoresIn(csFn(body)), [REPEATS + 1]);
});

test("fallbacks beside an if and ternaries add nothing to their score", () => {
  const body = `    if (x) return A() ?? B() ?? C();\n${repeat(
    (i) => `    var v${i} = ready ? A() ?? B() : C();`,
  )}`;
  assert.deepEqual(scoresIn(csFn(body)), [REPEATS + 2]);
});
