// Characterization tests for config.mjs. Covers thresholds, profiles, and
// path classification. These describe CURRENT behavior.
// They must not change it.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConfig,
  isEntryPath,
  isTestPath,
  severityFor,
} from "./config.mjs";

test("isTestPath matches test/spec files and test directories", () => {
  assert.equal(isTestPath("src/foo.test.ts"), true);
  assert.equal(isTestPath("src/foo.spec.ts"), true);
  assert.equal(isTestPath("tests/foo.ts"), true);
  assert.equal(isTestPath("src/__tests__/foo.ts"), true);
  assert.equal(isTestPath("pkg/foo_test.go"), true);
  assert.equal(isTestPath("Pkg/FooTests.cs"), true);
});

test("isTestPath does not match ordinary production paths", () => {
  assert.equal(isTestPath("src/foo.ts"), false);
  assert.equal(isTestPath("src/testament.ts"), false);
  assert.equal(isTestPath("src/lib/protest.py"), false);
});

test(
  "isTestPath matches default harness directory fragments with no declared " +
    "fragments",
  () => {
    assert.equal(isTestPath("src/testing/helper.ts"), true);
    assert.equal(isTestPath("src/fixtures/data.ts"), true);
    assert.equal(isTestPath("src/harness/runner.ts"), true);
    assert.equal(isTestPath("src/mocks/api.ts"), true);
    assert.equal(isTestPath("src/stubs/service.ts"), true);
  },
);

test(
  "isTestPath does not match a plain production path against the default " +
    "harness patterns",
  () => {
    assert.equal(isTestPath("src/scenario/build.ts"), false);
  },
);

test(
  "isTestPath called with no declared fragments behaves exactly as before",
  () => {
  assert.equal(isTestPath("src/foo.test.ts"), true);
  assert.equal(isTestPath("src/foo.ts"), false);
  assert.equal(isTestPath("src/testing/helper.ts"), true);
});

test("isTestPath treats a declared fragment as test code", () => {
  assert.equal(isTestPath("Scenario/Runner.cs", ["Scenario/"]), true);
  assert.equal(
    isTestPath("RetroBurn.Core/Testing/Harness.cs", [
      "RetroBurn.Core/Testing/",
    ]),
    true,
  );
});

test(
  "isTestPath ignores a declared fragment that does not appear in the path",
  () => {
  assert.equal(isTestPath("src/production/foo.ts", ["Scenario/"]), false);
});

test("isEntryPath matches recognized entry-point basenames", () => {
  assert.equal(isEntryPath("src/index.ts"), true);
  assert.equal(isEntryPath("src/main.py"), true);
  assert.equal(isEntryPath("cli.js"), true);
  assert.equal(isEntryPath("pkg/__init__.py"), true);
});

test("isEntryPath does not match ordinary module basenames", () => {
  assert.equal(isEntryPath("src/util.ts"), false);
  assert.equal(isEntryPath("src/mainframe.ts"), false);
});
