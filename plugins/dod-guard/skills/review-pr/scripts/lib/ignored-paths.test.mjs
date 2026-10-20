// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join, resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
import { ignoredPaths, parseIgnoredPaths, scanArguments } from "./ignored-paths.mjs";

const REPOSITORY = fileURLToPath(new URL("../../../../../../", import.meta.url));
const SCANNER = resolve(REPOSITORY, "packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs");

function ignoredRepository() {
  const root = mkdtempSync(join(tmpdir(), "ignored-paths-"));
  spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
  writeFileSync(join(root, ".gitignore"), "dist-test/\n*.tmp\n");
  mkdirSync(join(root, "dist-test"));
  writeFileSync(join(root, "dist-test", "stale.mjs"), "function unusedThing() {\n  return 1;\n}\n");
  writeFileSync(join(root, "keep.tmp"), "x\n");
  writeFileSync(join(root, "kept.mjs"), "export const kept = 1;\n");
  return root;
}

function scanned(root, args) {
  const run = spawnSync(process.execPath, [SCANNER, ...args, "--rules=unused-local"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout).violations.map((violation) => violation.file);
}

test("parseIgnoredPaths splits on NUL and drops empty entries", () => {
  assert.deepEqual(parseIgnoredPaths("a/dist-test/\0b.log\0"), ["a/dist-test/", "b.log"]);
  assert.deepEqual(parseIgnoredPaths(""), []);
});

test("ignoredPaths lists the gitignored directory and file of a checkout", () => {
  const root = ignoredRepository();
  try {
    assert.deepEqual(ignoredPaths(root).sort(), ["dist-test/", "keep.tmp"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanArguments builds the scan command with one exclude per ignored path", () => {
  assert.deepEqual(scanArguments("/r", ["dist-test/", "keep.tmp"]), [
    ".",
    "--root=/r",
    "--format=json",
    "--exclude=dist-test/",
    "--exclude=keep.tmp",
  ]);
});

test("scanArguments keeps directories past the budget and throws when directories alone do not fit", () => {
  const files = Array.from({ length: 2000 }, (_, index) => `build/generated-${index}.log`);
  assert.deepEqual(scanArguments("/r", [...files, "dist-test/"]), [
    ".",
    "--root=/r",
    "--format=json",
    "--exclude=dist-test/",
  ]);
  const directories = Array.from({ length: 2000 }, (_, index) => `directory-${index}-with-a-long-name/`);
  assert.throws(() => scanArguments("/r", directories), /do not fit/);
});

test("the real scanner reports no violation under a gitignored directory when given the built arguments", () => {
  const root = ignoredRepository();
  try {
    assert.deepEqual(scanned(root, scanArguments(root, ignoredPaths(root))), []);
    assert.deepEqual(scanned(root, [".", `--root=${root}`, "--format=json"]), ["dist-test/stale.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
