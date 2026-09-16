import assert from "node:assert/strict";
import { test } from "node:test";
import {
  csFile,
  tsFile,
  tupleViolations,
} from "./rules-file-fixtures.test.mjs";

test("the tuple rule rejects named and unnamed TypeScript tuple types", () => {
  const code =
    "type Named = [count: number, label: string];\n" +
    "type Unnamed = [number, string];";
  assert.equal(tupleViolations(tsFile("src/types.ts", code)).length, 2);
});

test("the tuple rule rejects named and unnamed C# tuple return types", () => {
  const code = [
    "class Results {",
    '    (int count, string label) Named() => (1, "one");',
    '    (int, string) Unnamed() => (1, "one");',
    "}",
  ].join("\n");
  assert.equal(tupleViolations(csFile("src/Results.cs", code)).length, 2);
});
