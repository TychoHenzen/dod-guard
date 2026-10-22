import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileWithCode,
  reachabilityRulesFor,
  testFile,
} from "./rules-project-fixtures.test.mjs";

const TEST_ONLY = ["test-only-export"];

test("an export called by its own file's main() is not test-only", () => {
  const advisor = [
    "export async function runAdvisor(options) {",
    "  return options.prompt;",
    "}",
    "async function main() {",
    '  await runAdvisor({ prompt: "x" });',
    "}",
    "if (import.meta.url === `file://${process.argv[1]}`) main();",
  ].join("\n");
  const files = [
    fileWithCode("src/advisor.ts", advisor),
    testFile("tests/advisor.test.ts", "runAdvisor({});"),
  ];
  assert.deepEqual(reachabilityRulesFor("runAdvisor", files), []);
});

test("a recursion-only export used by a test stays test-only", () => {
  const walker = "export function walk(n) { return n > 0 ? walk(n - 1) : 0; }";
  const files = [
    fileWithCode("src/walker.ts", walker),
    testFile("tests/walker.test.ts", "walk(3);"),
  ];
  assert.deepEqual(reachabilityRulesFor("walk", files), TEST_ONLY);
});

test("an export-list name used only by a test stays test-only", () => {
  const files = [
    fileWithCode("src/shape.ts", "function shape() {}\nexport { shape };"),
    testFile("tests/shape.test.ts", "shape();"),
  ];
  assert.deepEqual(reachabilityRulesFor("shape", files), TEST_ONLY);
});

test("an export used only in its own file is not dead-export", () => {
  const limits = [
    "export const LIMIT = 3;",
    "export function clamp(v) { return Math.min(v, LIMIT); }",
  ].join("\n");
  const files = [
    fileWithCode("src/limits.ts", limits),
    fileWithCode("src/caller.ts", "clamp(9);"),
  ];
  assert.deepEqual(reachabilityRulesFor("LIMIT", files), []);
});

test("an export with no findable body keeps the file-blind result", () => {
  const unclosed = "export function f() {\n  return 1;\n\nf();";
  const files = [
    fileWithCode("src/unclosed.ts", unclosed),
    testFile("tests/unclosed.test.ts", "f();"),
  ];
  assert.deepEqual(reachabilityRulesFor("f", files), TEST_ONLY);
});

test("a const named only in its own initializer stays test-only", () => {
  const files = [
    fileWithCode(
      "src/registry.ts",
      "export const registry = { self: () => registry };",
    ),
    testFile("tests/registry.test.ts", "registry.self();"),
  ];
  assert.deepEqual(reachabilityRulesFor("registry", files), TEST_ONLY);
});
