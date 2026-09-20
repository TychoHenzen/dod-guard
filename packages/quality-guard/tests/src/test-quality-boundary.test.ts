import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeTestQuality } from "../../src/test-quality/analyze.js";

test("requires an input and expected oracle for declared boundaries", () => {
  const report = analyzeTestQuality({
    schemaVersion: 1,
    sources: [
      { path: "src/parser.py", language: "python", behaviors: [{ id: "edge", kind: "boundary" }] },
    ],
    tests: [],
  });

  assert.equal(report.status, "invalid");
  assert.equal(
    report.errors.some((error) => error.includes("input and expected")),
    true,
  );
});
