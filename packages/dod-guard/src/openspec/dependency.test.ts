import assert from "node:assert/strict";
import { test } from "node:test";
import type { OpenSpecDependency } from "./dependency.js";

// dependency.ts is type-only - inert at runtime. This pins the field list a
// consumer relies on, so a shape change fails the compiler rather than
// silently dropping a field convert.ts reads.
test("OpenSpecDependency carries id, done, path and description", () => {
  const dep: OpenSpecDependency = {
    id: "specs/foo/spec.md",
    done: false,
    path: "specs/**/*.md",
    description: "spec delta",
  };
  assert.equal(dep.id, "specs/foo/spec.md");
  assert.equal(dep.done, false);
  assert.equal(dep.path, "specs/**/*.md");
  assert.equal(dep.description, "spec delta");
});
