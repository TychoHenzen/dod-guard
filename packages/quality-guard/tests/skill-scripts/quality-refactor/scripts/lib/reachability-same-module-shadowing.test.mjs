import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileWithCode,
  reachabilityRulesFor,
  testFile,
} from "./rules-project-fixtures.test.mjs";

const TEST_ONLY = ["test-only-export"];

const SHAPE_TASK = [
  'export const lensEvidence = ["lens"];',
  "export function shapeTask(id, lensEvidence) {",
  "  return lensEvidence;",
  "}",
];

function shapeTaskFiles(module) {
  return [
    fileWithCode("src/tasks.ts", module.join("\n")),
    fileWithCode("src/caller.ts", "shapeTask(1, []);"),
    testFile("tests/tasks.test.ts", "lensEvidence;"),
  ];
}

test("a same-named parameter is not a use of the export", () => {
  const files = shapeTaskFiles(SHAPE_TASK);
  assert.deepEqual(reachabilityRulesFor("lensEvidence", files), TEST_ONLY);
});

test("a use outside the shadowing function still counts", () => {
  const reader = "export function lenses() { return lensEvidence; }";
  const files = shapeTaskFiles([...SHAPE_TASK, reader]);
  assert.deepEqual(reachabilityRulesFor("lensEvidence", files), []);
});
