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

test("runs a JavaScript tool test directly without a package build", () => {
  const mapped = mapCompiledTest(workspaceRoot, "tools/openspec-dashboard/test/code-explorer-launch.test.mjs");

  assert.equal(mapped.packageName, undefined);
  assert.equal(mapped.compiledTest, resolve(workspaceRoot, "tools/openspec-dashboard/test/code-explorer-launch.test.mjs"));
});

test("rejects unsupported tool test paths", () => {
  assert.throws(
    () => mapCompiledTest(workspaceRoot, "tools/openspec-dashboard/test/code-explorer-launch.test.ts"),
    /expected a tools.*test/,
  );
});

test("rejects a test path outside the workspace", () => {
  assert.throws(() => mapCompiledTest(workspaceRoot, "../outside.test.ts"), /outside the workspace/);
});
