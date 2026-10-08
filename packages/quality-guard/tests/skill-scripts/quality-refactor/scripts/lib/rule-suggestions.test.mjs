import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_RULES } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { suggestionFor } from "../../../../../skills/quality-refactor/scripts/lib/rule-suggestions.mjs";
import { scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

test("every design-level rule has a suggestion", () => {
  for (const rule of [
    "file-length",
    "partial-type-length",
    "function-length",
    "complexity",
    "nesting-depth",
    "param-count",
    "types-per-file",
    "duplicate-block",
  ]) {
    assert.ok(ALL_RULES.includes(rule), `${rule} is not a configured rule`);
    assert.ok(suggestionFor(rule), `${rule} needs a suggestion`);
  }
});

test("file-length suggestions reject partial classes as a split", () => {
  assert.match(
    suggestionFor("file-length"),
    /Do not split one class into partial files/,
  );
  assert.match(suggestionFor("partial-type-length"), /still one class/);
});

test("structural findings carry a suggestion and cosmetic ones do not", () => {
  const branches = Array.from(
    { length: 12 },
    (_, index) => `  if (value === ${index}) return ${index};`,
  );
  const code = [
    "export function pick(value: number): number {",
    ...branches,
    "  return -1;",
    "}",
    `const long = "${"x".repeat(130)}";`,
  ].join("\n");
  const violations = scanViolations(tsFile("src/pick.ts", code));
  const complexity = violations.find(
    (violation) => violation.rule === "complexity",
  );
  const lineLength = violations.find(
    (violation) => violation.rule === "line-length",
  );
  assert.match(complexity.suggestion, /Guard Clauses/);
  assert.equal("suggestion" in lineLength, false);
});
