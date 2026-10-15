import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileWithCode,
  reachabilityRulesFor,
  testFile,
} from "./rules-project-fixtures.test.mjs";

test("a C# class used only by its own body and tests stays test-only", () => {
  const ledger = [
    "public class Ledger",
    "{",
    "    private readonly Ledger parent;",
    "    public Ledger() { }",
    "    public Ledger(Ledger parent) { this.parent = parent; }",
    "    public static Ledger Empty() => new Ledger();",
    "}",
  ].join("\n");
  const files = [
    fileWithCode("src/Ledger.cs", ledger, { lang: "cs" }),
    testFile("tests/LedgerTests.cs", "var ledger = new Ledger();", "cs"),
  ];
  assert.deepEqual(reachabilityRulesFor("Ledger", files), ["test-only-export"]);
});

test("a Python def called by another def in its file is used", () => {
  const pricing = [
    "def helper(x):",
    "    return x + 1",
    "",
    "def compute(x):",
    "    return helper(x) * 2",
  ].join("\n");
  const files = [
    fileWithCode("src/pricing.py", pricing, { lang: "py" }),
    testFile("tests/test_pricing.py", "helper(1)", "py"),
  ];
  assert.deepEqual(reachabilityRulesFor("helper", files), []);
});
