import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { checkReachability } from "./rules-project.mjs";
import { fileWithCode, scansFor } from "./rules-project-fixtures.test.mjs";

test("an export referenced by production code is not dead", () => {
  const files = [
    fileWithCode("src/a.ts", "export function foo() {}"),
    fileWithCode("src/b.ts", "foo();"),
  ];
  const found = checkReachability({
    files,
    scans: scansFor(files),
    config: buildConfig("default"),
  });
  assert.equal(
    found.some((violation) => violation.file === "src/a.ts"),
    false,
  );
});

test("an export with no in-repo references is dead-export", () => {
  const files = [
    fileWithCode("src/a.ts", "export function unusedFn() {}"),
    fileWithCode("src/b.ts", "console.log('nothing to do with it')"),
  ];
  const config = buildConfig("default");
  const found = checkReachability({ files, scans: scansFor(files), config });
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "dead-export");
  assert.equal(found[0].severity, config.presence["dead-export"]);
  assert.match(found[0].message, /unusedFn/);
});

test("an export referenced only by a test is test-only-export", () => {
  const files = [
    fileWithCode("src/a.ts", "export function testOnlyFn() {}"),
    fileWithCode("src/b.test.ts", "testOnlyFn();", { isTest: true }),
  ];
  const config = buildConfig("default");
  const found = checkReachability({ files, scans: scansFor(files), config });
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "test-only-export");
  assert.equal(found[0].severity, config.presence["test-only-export"]);
  assert.match(found[0].message, /testOnlyFn/);
});

test("calling reachability without manifests preserves the default", () => {
  const files = [
    fileWithCode("src/a.ts", "export function unusedFn() {}"),
    fileWithCode("src/b.ts", "console.log('nothing to do with it')"),
  ];
  const found = checkReachability({
    files,
    scans: scansFor(files),
    config: buildConfig("default"),
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "dead-export");
});

test("entry files are skipped by reachability", () => {
  const files = [
    fileWithCode("src/index.ts", "export function unusedInEntry() {}"),
    fileWithCode("src/other.ts", "// nothing"),
  ];
  assert.equal(
    checkReachability({
      files,
      scans: scansFor(files),
      config: buildConfig("default"),
    }).length,
    0,
  );
});
