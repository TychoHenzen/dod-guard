import assert from "node:assert/strict";
import { test } from "node:test";
import { stampSymbols } from "../../../../../skills/quality-refactor/scripts/lib/finding-symbol.mjs";

test("stampSymbols adds only the symbol field", () => {
  const violations = [{ rule: "x", line: 3, message: "m" }];
  const functions = [{ name: "f", line: 2, end: 20 }];
  const starts = [0, 5, 10, 15, 25];
  stampSymbols(violations, functions, starts);
  assert.deepEqual(violations, [
    { rule: "x", line: 3, message: "m", symbol: "f" },
  ]);
});
