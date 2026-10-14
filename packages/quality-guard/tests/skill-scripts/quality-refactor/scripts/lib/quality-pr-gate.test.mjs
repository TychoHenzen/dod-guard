import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATED_PATHS,
  blockingViolations,
  isGenerated,
  normalizePath,
  parseArgs,
} from "../../../../../skills/quality-refactor/scripts/quality-pr-gate.mjs";

const violation = (file, severity, rule = "file-length") => ({
  file,
  line: 1,
  rule,
  severity,
  message: `${rule} finding`,
});

test("normalizePath makes Windows and dot-relative paths comparable", () => {
  assert.equal(
    normalizePath("packages\\quality-guard\\a.mjs"),
    "packages/quality-guard/a.mjs",
  );
  assert.equal(normalizePath("./packages/a.mjs"), "packages/a.mjs");
});

test("generated output is recognised by path fragment", () => {
  assert.equal(isGenerated("packages/code-explorer/dist-test/src/a.js"), true);
  assert.equal(isGenerated("packages/code-explorer/dist/src/a.js"), true);
  assert.equal(isGenerated("node_modules/x/index.js"), true);
  assert.equal(isGenerated("packages/code-explorer/src/a.ts"), false);
  assert.ok(GENERATED_PATHS.includes("/dist-test/"));
});

test("only high-severity findings in changed files block", () => {
  const violations = [
    violation("packages/a.mjs", "high"),
    violation("packages/a.mjs", "medium"),
    violation("packages/b.mjs", "high"),
    violation("packages/dist-test/c.js", "high"),
  ];
  const blocking = blockingViolations(violations, [
    "packages/a.mjs",
    "packages/dist-test/c.js",
  ]);
  assert.deepEqual(
    blocking.map((item) => item.file),
    ["packages/a.mjs"],
  );
});

test("a changed file with no high finding does not block", () => {
  const blocking = blockingViolations(
    [violation("packages/a.mjs", "medium")],
    ["packages/a.mjs"],
  );
  assert.deepEqual(blocking, []);
});

test("paths from git on Windows still match scanner paths", () => {
  const blocking = blockingViolations(
    [violation("packages/quality-guard/x.mjs", "high")],
    ["packages\\quality-guard\\x.mjs"],
  );
  assert.equal(blocking.length, 1);
});

test("parseArgs requires a base ref and at least one root", () => {
  assert.match(parseArgs([]).error, /--base/);
  assert.match(parseArgs(["--base=main"]).error, /--root/);
  assert.equal(parseArgs(["--base=main", "--root=packages"]).error, undefined);
  assert.match(parseArgs(["--bogus"]).error, /unknown argument/);
});

test("parseArgs keeps every root and exclude, plus the generated defaults", () => {
  const options = parseArgs([
    "--base=main",
    "--root=Scripts",
    "--root=addons",
    "--exclude=/gen/",
  ]);
  assert.deepEqual(options.roots, ["Scripts", "addons"]);
  assert.ok(options.excludes.includes("/gen/"));
  assert.ok(options.excludes.includes("/dist-test/"));
});
