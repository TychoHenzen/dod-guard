// Characterization tests for config.mjs. Covers thresholds, profiles, and
// path classification. These describe CURRENT behavior. They must not change it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConfig, isEntryPath, isTestPath, severityFor } from "./config.mjs";

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

test("isTestPath matches default harness directory fragments with no declared fragments", () => {
  assert.equal(isTestPath("src/testing/helper.ts"), true);
  assert.equal(isTestPath("src/fixtures/data.ts"), true);
  assert.equal(isTestPath("src/harness/runner.ts"), true);
  assert.equal(isTestPath("src/mocks/api.ts"), true);
  assert.equal(isTestPath("src/stubs/service.ts"), true);
});

test("isTestPath does not match a plain production path against the default harness patterns", () => {
  assert.equal(isTestPath("src/scenario/build.ts"), false);
});

test("isTestPath called with no declared fragments behaves exactly as before", () => {
  assert.equal(isTestPath("src/foo.test.ts"), true);
  assert.equal(isTestPath("src/foo.ts"), false);
  assert.equal(isTestPath("src/testing/helper.ts"), true);
});

test("isTestPath treats a declared fragment as test code", () => {
  assert.equal(isTestPath("Scenario/Runner.cs", ["Scenario/"]), true);
  assert.equal(isTestPath("RetroBurn.Core/Testing/Harness.cs", ["RetroBurn.Core/Testing/"]), true);
});

test("isTestPath ignores a declared fragment that does not appear in the path", () => {
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

test("severityFor is null strictly at and below the warn bound", () => {
  const config = buildConfig("default");
  assert.equal(severityFor(config, "complexity", 5), null);
  assert.equal(severityFor(config, "complexity", 4), null);
});

test("severityFor is warn strictly above the warn bound and at or below the error bound", () => {
  const config = buildConfig("default");
  assert.equal(severityFor(config, "complexity", 6), "warn");
  assert.equal(severityFor(config, "complexity", 10), "warn");
});

test("severityFor is error strictly above the error bound", () => {
  const config = buildConfig("default");
  assert.equal(severityFor(config, "complexity", 11), "error");
});

test("severityFor handles a null warn bound on types-per-file", () => {
  const config = buildConfig("default");
  assert.equal(severityFor(config, "types-per-file", 1), null);
  assert.equal(severityFor(config, "types-per-file", 2), "error");
});

test("severityFor returns null for a rule with no thresholds entry", () => {
  const config = buildConfig("default");
  assert.equal(severityFor(config, "else-branch", 1), null);
});

test("buildConfig default profile keeps warn and error bounds distinct", () => {
  const config = buildConfig("default");
  assert.deepEqual(config.thresholds.complexity, { warn: 5, error: 10 });
  assert.equal(config.presence["dead-export"], "error");
  assert.equal(config.presence["else-branch"], "warn");
});

test("buildConfig default profile downgrades test-only-export to warn, leaving dead-export at error", () => {
  const config = buildConfig("default");
  assert.equal(config.presence["test-only-export"], "warn");
  assert.equal(config.presence["dead-export"], "error");
});

test("buildConfig carries assumption-marker at warn by default and error under strict", () => {
  assert.equal(buildConfig("default").presence["assumption-marker"], "warn");
  assert.equal(buildConfig("strict").presence["assumption-marker"], "error");
});

test("buildConfig strict profile collapses warn onto error and escalates presence rules", () => {
  const config = buildConfig("strict");
  assert.deepEqual(config.thresholds.complexity, { warn: null, error: 5 });
  assert.deepEqual(config.thresholds["param-count"], { warn: null, error: 3 });
  assert.equal(config.presence["else-branch"], "error");
  assert.equal(config.presence["todo-marker"], "error");
});

test("buildConfig strict profile leaves an already null warn bound alone", () => {
  const config = buildConfig("strict");
  assert.deepEqual(config.thresholds["types-per-file"], { warn: null, error: 1 });
});
