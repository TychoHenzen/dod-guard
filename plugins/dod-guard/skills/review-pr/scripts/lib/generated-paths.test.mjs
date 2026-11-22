// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { isGeneratedPath } from "./generated-paths.mjs";

test("flags dist, dist-test and node_modules segments", () => {
  assert.equal(isGeneratedPath("packages/a/dist/bundle.js"), true);
  assert.equal(isGeneratedPath("dist/x.js"), true);
  assert.equal(isGeneratedPath("a/dist-test/t.js"), true);
  assert.equal(isGeneratedPath("node_modules/p/i.js"), true);
});

test("does not flag lookalike names", () => {
  assert.equal(isGeneratedPath("packages/a/distance.js"), false);
  assert.equal(isGeneratedPath("src/mydist/x.js"), false);
});

test("flags sidecars", () => {
  assert.equal(isGeneratedPath("Scripts/Foo.cs.uid"), true);
  assert.equal(isGeneratedPath("icon.png.import"), true);
  assert.equal(isGeneratedPath("Scripts/Foo.cs"), false);
});
