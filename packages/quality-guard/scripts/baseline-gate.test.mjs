import assert from "node:assert/strict";
import { test } from "node:test";
import { absoluteVerdict, ratchetVerdict } from "./baseline-gate.mjs";

test("absoluteVerdict allows a metric within the normal hard bound", () => {
  const blocking = absoluteVerdict([
    {
      rule: "file-length",
      severity: "warn",
      metric: 300,
      file: "src/a.ts",
      line: 1,
      message: "file is 300 lines",
    },
  ]);
  assert.deepEqual(blocking, []);
});

test("absoluteVerdict blocks a normal hard-bound error", () => {
  const blocking = absoluteVerdict([
    {
      rule: "file-length",
      severity: "error",
      metric: 301,
      file: "src/a.ts",
      line: 1,
      message: "file is 301 lines",
    },
  ]);
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /file-local hard bound/);
});

test("absoluteVerdict blocks presence errors without a numeric bound", () => {
  const blocking = absoluteVerdict([
    {
      rule: "types-per-file",
      severity: "error",
      metric: 2,
      file: "src/a.ts",
      line: 3,
      message: "2 types in one file",
    },
    {
      rule: "complexity",
      severity: "warn",
      metric: 6,
      file: "src/a.ts",
      line: 4,
      message: "complexity 6",
    },
  ]);
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /2 types in one file/);
});
test(
  "ratchetVerdict reports only regressions belonging to the scanned file",
  () => {
  const comparison = {
    regressions: [
      { file: "src/a.ts", rule: "complexity", before: 8, now: 11 },
      { file: "src/other.ts", rule: "complexity", before: 1, now: 4 },
    ],
  };
  const violations = [
    {
      rule: "complexity",
      file: "src/a.ts",
      line: 12,
      message: "complexity 11",
    },
  ];

  const blocking = ratchetVerdict(comparison, "src/a.ts", violations);
  assert.equal(blocking.length, 1);
  assert.match(blocking[0], /complexity: 8 before, 11 now/);
  assert.match(blocking[0], /src\/a\.ts:12/);
});

test("ratchetVerdict is empty when the file did not get worse", () => {
  const comparison = {
    regressions: [
      { file: "src/other.ts", rule: "complexity", before: 1, now: 4 },
    ],
  };
  assert.deepEqual(ratchetVerdict(comparison, "src/a.ts", []), []);
});
