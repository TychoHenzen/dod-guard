import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import {
  IGNORED_DIRECTORY_NAMES,
  isIgnoredUnderRoot,
  isIgnoredWorkspacePath,
} from "../../../src/freshness/ignored-paths.js";

it("pins the ignored list and ignores each name in any case", () => {
  assert.deepEqual(
    [...IGNORED_DIRECTORY_NAMES],
    [
      "node_modules",
      ".git",
      ".hg",
      ".svn",
      ".venv",
      "venv",
      "__pycache__",
      "dist",
      "dist-test",
      "coverage",
      "target",
      "obj",
    ],
  );
  for (const name of IGNORED_DIRECTORY_NAMES) {
    assert.equal(isIgnoredWorkspacePath(`${name}/a.js`), true, name);
    assert.equal(
      isIgnoredWorkspacePath(`${name.toUpperCase()}/a.js`),
      true,
      name,
    );
  }
  assert.equal(isIgnoredWorkspacePath("pkg/Target/x.rs"), true);
  assert.equal(isIgnoredWorkspacePath("a\\dist\\b.js"), true);
});

it("does not ignore names that only contain a listed name", () => {
  for (const path of [
    "scripts/build/x.ts",
    "src/dist.ts",
    "out/x.js",
    "bin/x.js",
    "src/targets.rs",
    "distribution/x.ts",
  ])
    assert.equal(isIgnoredWorkspacePath(path), false, path);
});

it("matches only paths inside the root, relative to the root", () => {
  const root = join(tmpdir(), "project");
  assert.equal(isIgnoredUnderRoot(root, join(root, "src", "a.ts")), false);
  assert.equal(isIgnoredUnderRoot(root, join(root, "node_modules", "a")), true);
  assert.equal(isIgnoredUnderRoot(root, root), false);
  assert.equal(
    isIgnoredUnderRoot(root, join(tmpdir(), "other", "node_modules", "a")),
    false,
  );
});

it("does not ignore a root that sits under an ignored ancestor", () => {
  const root = join(tmpdir(), "dist", "project");
  assert.equal(isIgnoredUnderRoot(root, join(root, "src", "a.ts")), false);
});

it("still ignores a directory whose name starts with two dots", () => {
  const root = join(tmpdir(), "project");
  assert.equal(
    isIgnoredUnderRoot(root, join(root, "..cache", "node_modules", "a.js")),
    true,
  );
});
