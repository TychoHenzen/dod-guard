import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { distTestFile } from "./dist-file.js";

test("distTestFile maps a package's src test file to its compiled dist counterpart", () => {
  const cwd = path.join("C:", "repo");
  const srcFile = path.join(cwd, "packages", "dod-guard", "src", "cover", "report.test.ts");
  const result = distTestFile(cwd, "packages/dod-guard", srcFile);
  assert.equal(result, path.join(cwd, "packages", "dod-guard", "dist", "cover", "report.test.js"));
});

test("distTestFile maps a nested src test file the same way", () => {
  const cwd = path.join("C:", "repo");
  const srcFile = path.join(cwd, "packages", "dod-guard", "src", "openspec", "scenario-id.test.ts");
  const result = distTestFile(cwd, "packages/dod-guard", srcFile);
  assert.equal(result, path.join(cwd, "packages", "dod-guard", "dist", "openspec", "scenario-id.test.js"));
});

test("distTestFile leaves a non-package group's file unchanged", () => {
  const cwd = path.join("C:", "repo");
  const srcFile = path.join(cwd, "tools", "openspec-dashboard", "lib", "reader.test.js");
  const result = distTestFile(cwd, "tools/openspec-dashboard", srcFile);
  assert.equal(result, srcFile);
});
