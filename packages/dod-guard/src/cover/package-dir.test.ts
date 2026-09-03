import assert from "node:assert/strict";
import { test } from "node:test";
import { testGlobsForGroup } from "./package-dir.js";

// covers: dod-guard/coverage-gate :: Test-file discovery is configurable per project :: A project has no test-globs.json
test("testGlobsForGroup returns broad defaults covering all supported languages", () => {
  const globs = testGlobsForGroup("anything");
  assert.ok(globs.some((g) => g.includes("*.test.ts")));
  assert.ok(globs.some((g) => g.includes("test_*.py")));
  assert.ok(globs.some((g) => g.includes("*_test.go")));
  assert.ok(globs.some((g) => g.includes("*Test.java")));
  assert.ok(globs.some((g) => g.includes("*Tests.cs")));
  assert.ok(globs.some((g) => g.includes("test_*.sh")));
});

// covers: dod-guard/coverage-gate :: Test-file discovery is configurable per project :: test-globs.json exists but has no entry for the group
test("testGlobsForGroup returns the same globs regardless of group", () => {
  assert.deepEqual(testGlobsForGroup("dod-guard"), testGlobsForGroup("eval"));
});
