import assert from "node:assert/strict";
import { test } from "node:test";
import { testGlobsForGroup } from "./package-dir.js";

test("testGlobsForGroup searches a package's src/ for .test.ts files", () => {
  assert.deepEqual(testGlobsForGroup("dod-guard"), ["packages/dod-guard/src/**/*.test.ts"]);
});

test("testGlobsForGroup searches openspec-dashboard flat for .test.js and .test.mjs", () => {
  assert.deepEqual(testGlobsForGroup("openspec-dashboard"), [
    "tools/openspec-dashboard/**/*.test.js",
    "tools/openspec-dashboard/**/*.test.mjs",
  ]);
});
