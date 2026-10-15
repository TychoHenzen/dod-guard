import assert from "node:assert/strict";
import test from "node:test";

import {
  baseRoots,
  parseNameStatus,
} from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-paths.mjs";

const always = () => true;
const never = () => false;

test("a root that exists at the merge base is scanned as is", () => {
  assert.deepEqual(baseRoots(["src"], [], always), ["src"]);
});

test("a renamed root is scanned through the old directory of its files", () => {
  const files = [
    { path: "lib/a.cs", basePath: "src/a.cs" },
    { path: "lib/sub/b.cs", basePath: "src/sub/b.cs" },
  ];
  assert.deepEqual(baseRoots(["lib"], files, never), ["src"]);
});

test("a nested root keeps its depth when it is renamed", () => {
  const files = [
    { path: "Scripts/Modules/a.cs", basePath: "Scripts/Features/a.cs" },
  ];
  assert.deepEqual(baseRoots(["Scripts/Modules"], files, never), [
    "Scripts/Features",
  ]);
});

test("a new root with no renamed files has nothing to scan at the merge base", () => {
  const files = [{ path: "lib/new.cs", basePath: null }];
  assert.deepEqual(baseRoots(["lib"], files, never), []);
});

test("a deleted file maps to itself so its findings count as removed", () => {
  assert.deepEqual(parseNameStatus("D\tsrc/gone.cs\n"), [
    { path: "src/gone.cs", basePath: "src/gone.cs" },
  ]);
});
