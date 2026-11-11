import assert from "node:assert/strict";
import { test } from "node:test";
import { csFile, scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

const javaFile = (rel, code) => ({
  rel,
  lang: "java",
  isTest: false,
  source: code,
  lines: code.split("\n"),
});

function namesOf(file) {
  return scanViolations(file)
    .filter((violation) => violation.rule === "stateless-method")
    .map((violation) => violation.message.split("(")[0]);
}

const AUDIT = [
  "public struct Audit",
  "{",
  "  private readonly int count;",
  "  public string Fault()",
  "  {",
  "    return CheckA() ?? CheckB();",
  "  }",
  "  private string CheckA()",
  "  {",
  "    return count > 0 ? null : Name();",
  "  }",
  "  private string CheckB()",
  "  {",
  "    return Name();",
  "  }",
  "  private string Name()",
  "  {",
  '    return "none";',
  "  }",
  "}",
].join("\n");

test("a method that calls instance methods is not stateless in C#", () => {
  assert.deepEqual(namesOf(csFile("src/Audit.cs", AUDIT)), ["Name"]);
});

test("a method that calls only a static sibling is still stateless", () => {
  const source = AUDIT.replace(
    "private string Name()",
    "private static string Name()",
  );
  assert.deepEqual(namesOf(csFile("src/Audit.cs", source)), ["CheckB"]);
});

test("a call on another object is not a call on this one", () => {
  const source = AUDIT.replace("return Name();", "return other.Name();");
  assert.deepEqual(namesOf(csFile("src/Audit.cs", source)), ["CheckB", "Name"]);
});

test("a method that only calls itself stays stateless in C#", () => {
  const source = AUDIT.replace("return Name();", "return CheckB();");
  assert.deepEqual(namesOf(csFile("src/Audit.cs", source)), ["CheckB", "Name"]);
});

test("a sibling named only in a comment or a string is not a call", () => {
  const source = AUDIT.replace(
    "return Name();",
    'return "CheckA()"; // CheckA() would be wrong here',
  );
  assert.deepEqual(namesOf(csFile("src/Audit.cs", source)), ["CheckB", "Name"]);
});

test("a bare call to an instance method is not stateless in Java", () => {
  const source = [
    "class Audit {",
    "  private int count;",
    "  String fault() { return check() + count; }",
    "  String check() { return name(); }",
    '  String name() { return "none"; }',
    "}",
  ].join("\n");
  assert.deepEqual(namesOf(javaFile("src/Audit.java", source)), ["name"]);
});

test("a bare call in TypeScript is not a call on this type", () => {
  const source = [
    "class Audit {",
    "  private readonly seen = 0;",
    "  run(): string {",
    "    return check();",
    "  }",
    "  check(): string {",
    "    return String(this.seen);",
    "  }",
    "}",
  ].join("\n");
  assert.deepEqual(namesOf(tsFile("src/audit.ts", source)), ["run"]);
});
