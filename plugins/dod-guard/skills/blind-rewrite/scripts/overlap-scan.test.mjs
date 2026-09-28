import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreOverlap } from "./overlap-scan.mjs";

test("overlap gate rejects a renamed skeleton", () => {
  const original = Array.from({ length: 20 }, (_, index) => `const value${index} = input${index};`).join("\n");
  const renamed = original.replaceAll("value", "result").replaceAll("input", "source");
  const result = scoreOverlap(original, renamed);
  assert.equal(result.pass, false);
  assert.ok(result.shapeNgram > 0.65);
});

test("overlap gate accepts an independent implementation", () => {
  const original = Array.from({ length: 20 }, (_, index) => `const value${index} = input${index};`).join("\n");
  const rewrite = Array.from({ length: 20 }, (_, index) => `output.push(normalize(record[${index}]));`).join("\n");
  const result = scoreOverlap(original, rewrite);
  assert.equal(result.pass, true);
});
