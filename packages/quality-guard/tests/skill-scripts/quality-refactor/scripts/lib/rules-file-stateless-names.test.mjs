import assert from "node:assert/strict";
import { test } from "node:test";
import { csFile, scanViolations } from "./rules-file-fixtures.test.mjs";

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

const javaAudit = (callee, decl) =>
  [
    "class Audit {",
    "  private int count;",
    `  String run() { return ${callee}; }`,
    `  ${decl} { return "" + count; }`,
    "}",
  ].join("\n");

test("a generic call to an instance method is not stateless in Java", () => {
  const source = javaAudit("check<Integer>()", "<T> String check()");
  assert.deepEqual(namesOf(javaFile("src/Audit.java", source)), []);
});

test("a dollar-named instance method is not stateless in Java", () => {
  const source = javaAudit("$check()", "String $check()");
  assert.deepEqual(namesOf(javaFile("src/Audit.java", source)), []);
});

test("a generic call to an instance method is not stateless in C#", () => {
  const source = [
    "public struct Audit",
    "{",
    "  private readonly int count;",
    "  public string Run() { return Check<int>(); }",
    "  private string Check<T>() { return count.ToString(); }",
    "}",
  ].join("\n");
  assert.deepEqual(namesOf(csFile("src/Audit.cs", source)), []);
});
