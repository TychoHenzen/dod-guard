import assert from "node:assert/strict";
import { test } from "node:test";
import { packageDirForGroup, testGlobsForGroup } from "./package-dir.js";

test("packageDirForGroup maps a group to its package directory", () => {
  assert.equal(packageDirForGroup("dod-guard"), "packages/dod-guard");
});

test("packageDirForGroup maps openspec-dashboard to the tool directory", () => {
  assert.equal(packageDirForGroup("openspec-dashboard"), "tools/openspec-dashboard");
});

test("testGlobsForGroup searches a package's src/ for .test.ts files", () => {
  assert.deepEqual(testGlobsForGroup("dod-guard"), ["packages/dod-guard/src/**/*.test.ts"]);
});

test("testGlobsForGroup searches openspec-dashboard flat for .test.js and .test.mjs", () => {
  assert.deepEqual(testGlobsForGroup("openspec-dashboard"), [
    "tools/openspec-dashboard/**/*.test.js",
    "tools/openspec-dashboard/**/*.test.mjs",
  ]);
});
