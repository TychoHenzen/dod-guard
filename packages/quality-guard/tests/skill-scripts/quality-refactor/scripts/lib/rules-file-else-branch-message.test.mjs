import assert from "node:assert/strict";
import { test } from "node:test";
import { scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

const findings = (file) =>
  scanViolations(file).filter((v) => v.rule === "else-branch");

test("a TypeScript two-way branch reports the reviewed message", () => {
  const code =
    "function pick(v: number): number { " +
    "if (v > 0) { return 1; } else { return 2; } }";
  assert.deepEqual(findings(tsFile("pick.ts", code)), [
    {
      file: "pick.ts",
      line: 1,
      rule: "else-branch",
      severity: "medium",
      message:
        "pick() has 1 if/else branch(es); " +
        "review whether a guard clause or polymorphism reads better",
      metric: 1,
      suggestion:
        "Options to review: handle the exceptional case first and " +
        "return early (Replace Nested Conditional with Guard Clauses), " +
        "or Replace Conditional with Polymorphism for a type switch. " +
        "Keep a genuine two-way branch whose outcomes are equally normal.",
      symbol: "pick",
    },
  ]);
});
