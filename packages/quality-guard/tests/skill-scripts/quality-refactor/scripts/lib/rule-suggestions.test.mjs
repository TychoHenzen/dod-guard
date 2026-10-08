import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_RULES } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { RULE_SUGGESTIONS } from "../../../../../skills/quality-refactor/scripts/lib/rule-suggestions.mjs";
import { scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

test("every suggestion belongs to a configured rule", () => {
  for (const rule of Object.keys(RULE_SUGGESTIONS))
    assert.ok(ALL_RULES.includes(rule), `${rule} is not a configured rule`);
});

test("file-length suggestions reject partial classes as a split", () => {
  assert.match(RULE_SUGGESTIONS["file-length"], /Do not split one class into partial files/);
  assert.match(RULE_SUGGESTIONS["partial-type-length"], /still one class/);
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
  const complexity = violations.find((violation) => violation.rule === "complexity");
  const lineLength = violations.find((violation) => violation.rule === "line-length");
  assert.match(complexity.suggestion, /Guard Clauses/);
  assert.equal("suggestion" in lineLength, false);
});
