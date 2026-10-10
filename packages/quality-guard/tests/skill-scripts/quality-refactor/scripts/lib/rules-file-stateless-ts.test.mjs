import assert from "node:assert/strict";
import { test } from "node:test";
import { scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

const BUILD_MESSAGE = /^build\(\) /;
const REAL_BODY_LINES = 35;
const GREET_LINE = 3;
// The rule message separates its parts with a long dash, U+2014.
const DASH_CODE_POINT = 0x20_14;
const DASH = String.fromCharCode(DASH_CODE_POINT);

function violationsOf(rule, source) {
  return scanViolations(tsFile("src/sample.ts", source)).filter(
    (violation) => violation.rule === rule,
  );
}

test("bodiless TypeScript signatures are not stateless methods (AC-01)", () => {
  const source = [
    "interface Panel {",
    "  title(): { text: string };",
    "}",
    "type Labels = {",
    "  caption(): { text: string };",
    "};",
    "abstract class Base {",
    "  abstract m(): { a: string };",
    "}",
    "class Counter {",
    "  private readonly n = 0;",
    "  bump(a: number): number;",
    "  bump(a: string): number;",
    "  bump(a: unknown): number {",
    "    return this.n + Number(a);",
    "  }",
    "}",
    "declare class D {",
    "  m(): () => void;",
    "}",
  ].join("\n");
  assert.deepEqual(violationsOf("stateless-method", source), []);
});

test("the #678 probe yields no stateless method", () => {
  const source =
    "interface Ctx { getOptions(): { getScratchDir(): { getAbsolutePath(): string } } }";
  assert.deepEqual(violationsOf("stateless-method", source), []);
});

test("a return-type object literal is not the body (AC-02)", () => {
  const source = [
    "class Box {",
    "  private readonly x = 1;",
    "  n(): { a: string } { return { a: String(this.x) }; }",
    "}",
  ].join("\n");
  assert.deepEqual(violationsOf("stateless-method", source), []);
});

test("function-length is measured from the real body (AC-02)", () => {
  const steps = Array.from({ length: 31 }, (_, k) => `    total += ${k};`);
  const source = [
    "class Report {",
    '  private readonly title = "t";',
    "  build(): { lines: string[] } {",
    "    let total = 0;",
    ...steps,
    "    return { lines: [String(total)] };",
    "  }",
    "}",
  ].join("\n");
  const lengths = violationsOf("function-length", source);
  assert.equal(lengths.length, 1);
  assert.match(lengths[0].message, BUILD_MESSAGE);
  assert.equal(lengths[0].metric, REAL_BODY_LINES);
});

test("a method that never touches state is reported (AC-03)", () => {
  const source = [
    "class Greeter {",
    '  private readonly prefix = "hi";',
    "  greet(name: string): string {",
    "    return name.trim();",
    "  }",
    "}",
  ].join("\n");
  const found = violationsOf("stateless-method", source);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, GREET_LINE);
  assert.equal(found[0].severity, "medium");
  assert.equal(
    found[0].message,
    `greet() never touches instance state ${DASH} make it a free function`,
  );
  assert.equal(
    found[0].suggestion,
    "Move it out of the class as a free function, extension method, or static " +
      "helper next to the data it does use.",
  );
});
