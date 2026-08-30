import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { mapCompiledTest, workspaceRoot } from "./run-compiled-js-test.mjs";

test("maps a package source TypeScript test to its compiled test", () => {
  const mapped = mapCompiledTest(workspaceRoot, "packages/code-explorer/src/testing/example.test.ts");

  assert.equal(mapped.packageName, "code-explorer");
  assert.equal(mapped.compiledTest, resolve(workspaceRoot, "packages/code-explorer/dist/testing/example.test.js"));
});

test("keeps an already compiled package test after rebuilding its package", () => {
  const mapped = mapCompiledTest(workspaceRoot, "packages/code-explorer/dist/index.test.js");

  assert.equal(mapped.packageName, "code-explorer");
  assert.equal(mapped.compiledTest, resolve(workspaceRoot, "packages/code-explorer/dist/index.test.js"));
});

test("rejects a test path outside the workspace", () => {
  assert.throws(() => mapCompiledTest(workspaceRoot, "../outside.test.ts"), /outside the workspace/);
});
